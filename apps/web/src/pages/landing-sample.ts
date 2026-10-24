// Sample data for the landing page previews. Made up, not a real account.
import type { AccountRisk, Analytics, Group } from "@/lib/api/types"
import { LOCAL_TZ, WEEKDAYS, today } from "@/lib/format"
import type { Insight } from "@/lib/insights"

const g = (key: string, net: number, trades: number, wins: number): Group =>
  ({ key, trades, wins, losses: trades - wins, net, winRate: wins / trades, avg: net / trades, grossWin: Math.max(net, 0), grossLoss: Math.min(net, 0) }) as Group

// A rising equity curve with dips, the same on every load (no randomness).
const t0 = Date.UTC(2026, 8, 1)
let equity = 0
const curve = Array.from({ length: 180 }, (_, n) => {
  const net = 4.2 + Math.sin(n / 6) * 14 + Math.sin(n / 2.3) * 6
  equity += net
  return { n, time: t0 + n * 4 * 3600e3, equity: Math.round(equity * 100) / 100, drawdown: 0, net }
})

const weekday = WEEKDAYS[(new Date().getDay() + 6) % 7]

export const SAMPLE: Analytics = {
  period: ["2026-09-01", "2026-10-23"],
  symbols: ["XAUUSD", "EURUSD"],
  summary: {
    ...g("all", equity, 180, 99),
    days: 38, bestTrade: 96.4, worstTrade: -48.1, wins: 99, losses: 81, winRate: 0.55, profitFactor: 1.62,
    grossWin: 2006.3, grossLoss: -1238.5, avgWin: 20.27, avgLoss: -15.29, avg: equity / 180, maxDd: -164.2,
    maxLossStreak: 5, tradesPerDay: 4.7, medianDurationMin: 26,
  },
  curve,
  daily: [g("2026-09-12", 212.4, 5, 4), g("2026-10-02", -131.8, 7, 2), g(today(LOCAL_TZ), 18.6, 1, 1)],
  byWeekday: [g(weekday, 284.5, 31, 19)],
  capSim: [{ key: "3", cap: 3, net: 912.1, trades: 110 }],
  afterLoss: { windowMin: 10, after: g("after", -96, 18, 5), other: g("other", 864, 162, 94) },
  optimization: {
    focus: [
      { kind: "weekday", keys: [weekday, "Tue"], fit: { trades: 0, net: 0, winRate: 0 }, test: { trades: 0, net: 0, winRate: 0 } },
      { kind: "hour", keys: ["9", "10", "14"], fit: { trades: 0, net: 0, winRate: 0 }, test: { trades: 0, net: 0, winRate: 0 } },
      { kind: "symbol", keys: ["XAUUSD"], fit: { trades: 0, net: 0, winRate: 0 }, test: { trades: 0, net: 0, winRate: 0 } },
      { kind: "duration", keys: ["15–30m"], fit: { trades: 0, net: 0, winRate: 0 }, test: { trades: 0, net: 0, winRate: 0 } },
    ],
    rules: { skipHours: [20, 21, 22], skipWeekdays: [], cap: 3, lossLimit: 60 },
  },
} as unknown as Analytics

export const SAMPLE_RISK: AccountRisk = { kind: "percent", daily: 2, perTrade: 1, maxTrades: null, weekends: true }
export const SAMPLE_BALANCE = 2500

const hours = Array.from({ length: 24 }, (_, h) => h)
export const SAMPLE_INSIGHTS: Insight[] = [
  {
    tone: "bad",
    title: "Avoid 8 PM to 11 PM",
    figure: "−$212.40",
    detail: "These hours lost you $212.40 in 26 trades.",
    viz: { kind: "bars", bars: hours.slice(6).map((h) => ({ label: String(h), value: [20, 21, 22].includes(h) ? -60 - h : 18 + ((h * 7) % 30), on: [20, 21, 22].includes(h) })) },
  },
  {
    tone: "bad",
    title: "Wait 10 min after a loss",
    figure: "−$5.33 a trade",
    detail: "Trades within 10 min of a loss averaged −$5.33. Other trades averaged +$5.33.",
    viz: { kind: "compare", rows: [{ label: "After a loss", value: -5.33, on: true }, { label: "Other trades", value: 5.33, on: false }] },
  },
  {
    tone: "good",
    title: "Stop after 3 trades a day",
    figure: "+$144.40",
    detail: "You would have $144.40 more. Trades after your 3rd each day lost money.",
    viz: { kind: "compare", rows: [{ label: "Actual", value: 767.7, on: false }, { label: "Cap at 3", value: 912.1, on: true }] },
  },
]
