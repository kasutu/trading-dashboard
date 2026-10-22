// Mock market prices. trades.json has the same placeholder prices on every row, so the mock gives
// each trade believable ones: open prices follow a seeded random walk per symbol, and the close
// price is the open moved by exactly the trade's profit. Candles are then generated through those
// prices (a Brownian bridge between them), so a chart passes through each entry and exit.
import type { Candle, Timeframe, Trade } from "@/lib/api/types"

type Spec = { start: number; digits: number; contract: number; dailyVol: number }

/** Contract size (units per lot) and typical daily volatility (log-return standard deviation). */
const SPECS: Record<string, Spec> = {
  XAUUSD: { start: 4150, digits: 2, contract: 100, dailyVol: 0.012 },
  EURUSD: { start: 1.165, digits: 5, contract: 100_000, dailyVol: 0.005 },
  BTCUSD: { start: 112_000, digits: 2, contract: 1, dailyVol: 0.025 },
}
const DEFAULT_SPEC: Spec = { start: 100, digits: 2, contract: 100, dailyVol: 0.015 }
const specOf = (symbol: string) => SPECS[symbol] ?? DEFAULT_SPEC

export const TF_SECONDS: Record<Timeframe, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 }

/** FNV-1a string hash, for seeds. */
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Seeded uniform [0, 1) (mulberry32) and standard normal (Box-Muller). */
function rng(seed: number) {
  let a = seed
  const uniform = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const normal = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform())
  return { uniform, normal }
}

const round = (n: number, digits: number) => +n.toFixed(digits)
/** Volatility of the log price per √second. */
const sigmaOf = (symbol: string) => specOf(symbol).dailyVol / Math.sqrt(86400)

/** Trades with believable prices, stop losses and take profits. Same input, same output. */
export function withMarketPrices<T extends Trade>(trades: T[]): T[] {
  const last = new Map<string, { t: number; p: number }>()
  const sorted = [...trades].sort((a, b) => a.open.localeCompare(b.open))
  const priced = new Map<T, T>()
  // Partial closes share their open, so trades opened at the same moment share the open price.
  const opens = new Map<string, number>()
  for (const tr of sorted) {
    const spec = specOf(tr.symbol)
    const r = rng(hash(`${tr.symbol}|${tr.ticket}|${tr.open}`))
    const t = Date.parse(tr.open) / 1000
    const prev = last.get(tr.symbol) ?? { t, p: spec.start }
    const dt = Math.max(0, t - prev.t)
    const walked = round(prev.p * Math.exp(sigmaOf(tr.symbol) * Math.sqrt(dt) * r.normal()), spec.digits)
    const openPrice = opens.get(`${tr.symbol}|${tr.open}`) ?? walked
    opens.set(`${tr.symbol}|${tr.open}`, openPrice)
    const dir = tr.side === "buy" ? 1 : -1
    const move = tr.lots > 0 ? (dir * tr.profit) / (tr.lots * spec.contract) : 0
    const closePrice = round(Math.max(openPrice + move, openPrice * 0.01), spec.digits)
    // Stops: the hit level is the close price, the other side is 0.8-2x the move away.
    const away = Math.max(Math.abs(move), openPrice * 0.0005) * (0.8 + 1.2 * r.uniform())
    let sl: number | null = null
    let tp: number | null = null
    if (tr.reason === "sl") [sl, tp] = [closePrice, openPrice + dir * away]
    else if (tr.reason === "tp") [tp, sl] = [closePrice, openPrice - dir * away]
    else if (r.uniform() < 0.5) [sl, tp] = [openPrice - dir * away, openPrice + dir * away * 1.5]
    priced.set(tr, {
      ...tr,
      openPrice,
      closePrice,
      sl: sl === null ? null : round(sl, spec.digits),
      tp: tp === null ? null : round(tp, spec.digits),
    })
    const tc = Date.parse(tr.close) / 1000
    if (tc >= (last.get(tr.symbol)?.t ?? -Infinity)) last.set(tr.symbol, { t: tc, p: closePrice })
  }
  return trades.map((tr) => priced.get(tr)!)
}

const TICKS_PER_CANDLE = 6
export const MAX_CANDLES = 2000

/** Synthetic candles for `symbol` between two unix-second times. They pass through the open and
 *  close prices of every trade on the symbol inside the window (or the nearest trade outside it).
 *  Returns null when the symbol has no trades. */
export function generateCandles(trades: Trade[], symbol: string, from: number, to: number, tf: Timeframe): Candle[] | null {
  const own = trades.filter((t) => t.symbol === symbol)
  if (!own.length) return null
  const spec = specOf(symbol)
  const sec = TF_SECONDS[tf]
  const start = Math.floor(from / sec) * sec

  // Anchors: [unix seconds, log price], one per time, sorted.
  const points = own.flatMap((t) => [
    [Date.parse(t.open) / 1000, t.openPrice],
    [Date.parse(t.close) / 1000, t.closePrice],
  ])
  let anchors = points.filter(([t]) => t >= start && t <= to)
  if (!anchors.length) anchors = [points.reduce((a, b) => (Math.abs(b[0] - from) < Math.abs(a[0] - from) ? b : a))]
  const byTime = new Map<number, number>()
  for (const [t, p] of anchors) if (!byTime.has(t)) byTime.set(t, Math.log(p))
  const sortedAnchors = [...byTime].sort((a, b) => a[0] - b[0])

  // Tick times: a fixed grid inside each candle, plus the anchors themselves.
  const step = sec / TICKS_PER_CANDLE
  const lo = Math.min(start, sortedAnchors[0][0])
  const hi = Math.max(to, sortedAnchors.at(-1)![0])
  const times = new Set<number>(byTime.keys())
  for (let t = Math.floor(lo / step) * step; t <= hi; t += step) times.add(t)
  const ticks = [...times].sort((a, b) => a - b)

  const r = rng(hash(`${symbol}|${from}|${tf}`))
  const sigma = sigmaOf(symbol)
  // A slowly changing volatility level, so quiet and busy stretches alternate.
  let regime = 1
  const vol = () => {
    regime = Math.min(2.2, Math.max(0.5, regime * Math.exp(0.08 * r.normal())))
    return sigma * regime
  }
  const x = new Map<number, number>(byTime)
  const first = ticks.indexOf(sortedAnchors[0][0])
  const lastIdx = ticks.indexOf(sortedAnchors.at(-1)![0])
  // Before the first anchor: walk backwards from it.
  for (let i = first - 1; i >= 0; i--) x.set(ticks[i], x.get(ticks[i + 1])! + vol() * Math.sqrt(ticks[i + 1] - ticks[i]) * r.normal())
  // Between anchors: a Brownian bridge, so the path lands exactly on the next anchor.
  let target = 1
  for (let i = first; i < lastIdx; i++) {
    while (sortedAnchors[target][0] <= ticks[i]) target++
    const [tT, xT] = sortedAnchors[target]
    const next = ticks[i + 1]
    if (next === tT) {
      x.set(next, xT)
      continue
    }
    const xi = x.get(ticks[i])!
    const dt = next - ticks[i]
    const rem = tT - ticks[i]
    const s = vol()
    x.set(next, xi + ((xT - xi) * dt) / rem + s * Math.sqrt((dt * (rem - dt)) / rem) * r.normal())
  }
  // After the last anchor: walk forwards.
  for (let i = lastIdx + 1; i < ticks.length; i++) x.set(ticks[i], x.get(ticks[i - 1])! + vol() * Math.sqrt(ticks[i] - ticks[i - 1]) * r.normal())

  // Group ticks into candles. Each candle opens at the previous close; wicks reach a little past
  // the extreme ticks, since prices also move between ticks.
  const candles: Candle[] = []
  let prevClose: number | null = null
  let i = 0
  while (i < ticks.length && ticks[i] < start) prevClose = Math.exp(x.get(ticks[i++])!)
  for (let t0 = start; t0 < to; t0 += sec) {
    const prices: number[] = []
    while (i < ticks.length && ticks[i] < t0 + sec) prices.push(Math.exp(x.get(ticks[i++])!))
    if (!prices.length) continue
    const open = prevClose ?? prices[0]
    const close = prices.at(-1)!
    const wick = (p: number) => p * sigma * Math.sqrt(step) * Math.abs(r.normal()) * 0.6
    const high = Math.max(open, ...prices)
    const low = Math.min(open, ...prices)
    candles.push({
      time: t0,
      open: round(open, spec.digits),
      high: round(high + wick(high), spec.digits),
      low: round(Math.max(low - wick(low), low * 0.5), spec.digits),
      close: round(close, spec.digits),
    })
    prevClose = close
  }
  return candles
}

/** GET /accounts/:id/candles?symbol=&tf=&from=&to= (from and to: ISO 8601). */
export function candleResponse(trades: Trade[], q: URLSearchParams): { status: number; body: unknown } {
  const symbol = q.get("symbol") ?? ""
  const tf = q.get("tf") as Timeframe
  const from = Date.parse(q.get("from") ?? "") / 1000
  const to = Date.parse(q.get("to") ?? "") / 1000
  if (!symbol) return { status: 400, body: { error: "Pick a symbol." } }
  if (!(tf in TF_SECONDS)) return { status: 400, body: { error: "The timeframe must be 1m, 5m, 15m, 1h, 4h or 1d." } }
  if (!(from < to)) return { status: 400, body: { error: "The start must be before the end." } }
  if ((to - from) / TF_SECONDS[tf] > MAX_CANDLES)
    return { status: 422, body: { error: `That is more than ${MAX_CANDLES} candles. Pick a longer timeframe.` } }
  const candles = generateCandles(trades, symbol, from, to, tf)
  if (!candles) return { status: 404, body: { error: `There are no prices for ${symbol}.` } }
  return { status: 200, body: { symbol, tf, candles } }
}
