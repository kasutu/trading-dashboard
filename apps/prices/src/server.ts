// Jurno prices: historical candles from TradingView (https://github.com/Mathieu2301/TradingView-API, unofficial),
// for the API only. GET /candles?symbol=XAUUSD&tf=5m&from=<ISO>&to=<ISO> → { tf, candles }.
// The API caches the answers; this service keeps nothing but which TradingView symbol worked.
import { createServer } from "node:http"
import { getCandles } from "@mathieuc/tradingview/data"
import { SECONDS, TIMEFRAMES, candidates, fallbacks, isTimeframe, type Timeframe } from "./market.ts"

const port = Number(process.env.PORT ?? 3002)
// Optional: TradingView `sessionid` and `sessionid_sign` cookies. Without them, older intraday history is limited.
const credentials =
  process.env.TV_SESSION && process.env.TV_SIGNATURE ? { session: process.env.TV_SESSION, signature: process.env.TV_SIGNATURE } : undefined

/** Broker symbol → the TradingView symbol that answered last time. */
const resolved = new Map<string, string>()

type Candle = { time: number; open: number; high: number; low: number; close: number }
class Reply extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** Candles for the window, in the asked length or the first longer one that has data. */
async function candles(symbol: string, tf: Timeframe, from: Date, to: Date) {
  const names = resolved.has(symbol) ? [resolved.get(symbol)!] : candidates(symbol)
  for (const name of names) {
    for (const len of fallbacks(tf)) {
      try {
        const bars = await getCandles({ symbol: name, timeframe: TIMEFRAMES[len], from, to, timeoutMs: 20_000, credentials })
        resolved.set(symbol, name)
        const out: Candle[] = bars
          // Keep the bar that holds `from`, and every bar that starts by `to`.
          .filter((b) => (b.time + SECONDS[len]) * 1000 > +from && b.time * 1000 <= +to)
          .map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
        if (out.length) return { tf: len, candles: out }
      } catch (e) {
        const code = (e as { code?: string }).code
        if (code === "SYMBOL_ERROR") break // try the next TradingView symbol
        if (code !== "NO_DATA") throw e
      }
    }
  }
  throw new Reply(404, `No prices for ${symbol} in this window.`)
}

const send = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(body))
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://prices")
  if (url.pathname === "/health") return send(res, 200, { ok: true })
  if (url.pathname !== "/candles" || req.method !== "GET") return send(res, 404, { error: "Not found." })
  const q = url.searchParams
  const symbol = q.get("symbol") ?? ""
  const tf = q.get("tf") ?? ""
  const from = new Date(q.get("from") ?? "")
  const to = new Date(q.get("to") ?? "")
  if (!symbol || !isTimeframe(tf) || Number.isNaN(+from) || Number.isNaN(+to) || from >= to)
    return send(res, 400, { error: "Send symbol, tf, and from before to (ISO times)." })
  try {
    send(res, 200, await candles(symbol, tf, from, to))
  } catch (e) {
    if (e instanceof Reply) return send(res, e.status, { error: e.message })
    console.error(symbol, tf, e)
    send(res, 502, { error: "The price source did not answer. Try again." })
  }
}).listen(port, () => console.log(`prices listening on ${port}`))
