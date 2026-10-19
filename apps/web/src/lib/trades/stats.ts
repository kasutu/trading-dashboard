import type { Group, LocalTrade, Trade } from "./types"
import { group, groupBy, round2 } from "./group"
import { WEEKDAYS } from "./time"

export function summary(ts: LocalTrade[]) {
  const g = group("all", ts)
  const wins = ts.filter((t) => t.net > 0)
  const losses = ts.filter((t) => t.net <= 0)
  const avgWin = wins.length ? g.grossWin / wins.length : 0
  const avgLoss = losses.length ? g.grossLoss / losses.length : 0

  let maxDD = 0, streak = 0, maxLossStreak = 0
  for (const p of equityCurve(ts)) {
    maxDD = Math.min(maxDD, p.drawdown)
    streak = p.net <= 0 ? streak + 1 : 0
    maxLossStreak = Math.max(maxLossStreak, streak)
  }
  const days = new Set(ts.map((t) => t.day)).size
  return {
    ...g,
    losses: losses.length,
    avgWin: round2(avgWin),
    avgLoss: round2(avgLoss),
    payoff: avgLoss ? Math.abs(avgWin / avgLoss) : 0,
    profitFactor: g.grossLoss ? Math.abs(g.grossWin / g.grossLoss) : g.grossWin > 0 ? Infinity : 0,
    maxDD: round2(maxDD),
    maxLossStreak,
    days,
    tradesPerDay: days ? ts.length / days : 0,
    medianDurationMin: median(ts.map((t) => t.durationMin)),
  }
}
export type Summary = ReturnType<typeof summary>

function median(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Cumulative net P&L in close order. */
export function equityCurve(ts: Trade[]) {
  const byClose = [...ts].sort((a, b) => +a.close - +b.close)
  let cum = 0, peak = 0
  return byClose.map((t, i) => {
    cum += t.net
    peak = Math.max(peak, cum)
    return { n: i + 1, time: +t.close, equity: round2(cum), drawdown: round2(cum - peak), net: t.net }
  })
}
export type EquityPoint = ReturnType<typeof equityCurve>[number]

export const daily = (ts: LocalTrade[]) => groupBy(ts, (t) => t.day).sort((a, b) => a.key.localeCompare(b.key))

export const byHour = (ts: LocalTrade[]) =>
  groupBy(ts, (t) => String(t.hour), Array.from({ length: 24 }, (_, i) => String(i)))

export const byWeekday = (ts: LocalTrade[]) =>
  groupBy(ts, (t) => WEEKDAYS[t.weekday], WEEKDAYS).filter((g, i) => i < 5 || g.trades > 0)

/** 7 × 24 grid of groups: [weekday][hour]. */
export const heatmap = (ts: LocalTrade[]): Group[][] =>
  WEEKDAYS.map((_, d) =>
    Array.from({ length: 24 }, (_, h) => group(`${d}-${h}`, ts.filter((t) => t.weekday === d && t.hour === h)))
  )

const DURATION: [string, number][] = [
  ["< 1m", 1],
  ["1–5m", 5],
  ["5–15m", 15],
  ["15–60m", 60],
  ["1–4h", 240],
  ["4h+", Infinity],
]
export const byDuration = (ts: Trade[]) =>
  groupBy(ts, (t) => DURATION.find(([, max]) => t.durationMin < max)![0], DURATION.map((d) => d[0])).filter(
    (g) => g.trades > 0
  )

/** A lot size means nothing without its instrument, so sizes are grouped per symbol: "XAUUSD · 0.2". */
export const sizeKey = (t: Trade) => `${t.symbol} · ${t.lots}`
export const splitSizeKey = (key: string) => {
  const [symbol, lots] = key.split(" · ")
  return { symbol, lots }
}
export const sizeLabel = (key: string) => {
  const { symbol, lots } = splitSizeKey(key)
  return `${lots} lots on ${symbol}`
}
export const byLots = (ts: Trade[]) =>
  groupBy(ts, sizeKey).sort((a, b) => {
    const x = splitSizeKey(a.key), y = splitSizeKey(b.key)
    return x.symbol.localeCompare(y.symbol) || Number(x.lots) - Number(y.lots)
  })

export const REASONS: Record<string, string> = {
  sl: "Stop loss",
  tp: "Take profit",
  user: "Manual",
  so: "Stop-out",
}
export const reasonLabel = (r: string) => REASONS[r] ?? (r || "Unknown")
export const byReason = (ts: Trade[]) => groupBy(ts, (t) => reasonLabel(t.reason)).sort((a, b) => b.trades - a.trades)

export const bySymbol = (ts: Trade[]) => groupBy(ts, (t) => t.symbol).sort((a, b) => b.trades - a.trades)
export const bySide = (ts: Trade[]) =>
  groupBy(ts, (t) => (t.side === "buy" ? "Buy" : "Sell"), ["Buy", "Sell"]).filter((g) => g.trades > 0)
