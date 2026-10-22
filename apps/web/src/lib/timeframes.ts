import type { Timeframe } from "@/lib/api/types"

/** Candle lengths in seconds, shortest first. */
export const TIMEFRAMES: [Timeframe, number][] = [
  ["1m", 60],
  ["5m", 300],
  ["15m", 900],
  ["1h", 3600],
  ["4h", 14400],
  ["1d", 86400],
]
export const tfSeconds = (tf: Timeframe) => TIMEFRAMES.find(([k]) => k === tf)![1]

/** The shortest timeframe that draws the hold time in at most 120 candles:
 *
 *  | Hold time       | Timeframe | Candles while open |
 *  | --------------- | --------- | ------------------ |
 *  | up to 2 hours   | 1m        | 1–120              |
 *  | up to 10 hours  | 5m        | 24–120             |
 *  | up to 30 hours  | 15m       | 40–120             |
 *  | up to 5 days    | 1h        | 30–120             |
 *  | up to 20 days   | 4h        | 30–120             |
 *  | longer          | 1d        | 20 and up          |
 *
 *  Trades under 20 minutes span fewer than 20 candles; 1m is the shortest there is. */
export function pickTimeframe(holdMin: number): Timeframe {
  return (TIMEFRAMES.find(([, s]) => (holdMin * 60) / s <= 120) ?? TIMEFRAMES.at(-1)!)[0]
}

/** Most candles one request may ask for. The API answers 422 above this. */
export const MAX_CANDLES = 2000

/** The window to fetch around a trade: 30% of the hold time on each side, at least 20 candles,
 *  rounded out to whole candles. ISO times, plus how many candles that is. */
export function candleWindow(open: string, close: string, tf: Timeframe) {
  const sec = tfSeconds(tf)
  const o = Date.parse(open) / 1000
  const c = Date.parse(close) / 1000
  const pad = Math.max(0.3 * (c - o), 20 * sec)
  const from = Math.floor((o - pad) / sec) * sec
  const to = Math.ceil((c + pad) / sec) * sec
  const iso = (s: number) => new Date(s * 1000).toISOString().replace(".000Z", "Z")
  return { from: iso(from), to: iso(to), count: Math.round((to - from) / sec) }
}
