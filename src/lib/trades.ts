import Papa from "papaparse"

export type Side = "buy" | "sell"

export interface Trade {
  ticket: string
  open: Date
  close: Date
  side: Side
  lots: number
  symbol: string
  openPrice: number
  closePrice: number
  sl: number | null
  tp: number | null
  commission: number
  swap: number
  profit: number
  /** profit + commission + swap */
  net: number
  reason: string
  durationMin: number
}

/** Same trade with time fields resolved in the chosen timezone. */
export interface TTrade extends Trade {
  day: string // yyyy-mm-dd of open time
  hour: number // 0-23 of open time
  weekday: number // 0 = Mon ... 6 = Sun
}

const num = (v: unknown) => {
  if (v === undefined || v === null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Exness exports UTC timestamps without a "Z"
const utc = (s: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z")

export function parseTradesCsv(text: string): Trade[] {
  const { data } = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })
  const trades: Trade[] = []
  for (const r of data) {
    if (!r.opening_time_utc || !r.closing_time_utc) continue
    const open = utc(r.opening_time_utc)
    const close = utc(r.closing_time_utc)
    if (isNaN(+open) || isNaN(+close)) continue
    const profit = num(r.profit) ?? 0
    const commission = num(r.commission) ?? 0
    const swap = num(r.swap) ?? 0
    trades.push({
      ticket: r.ticket,
      open,
      close,
      side: r.type?.toLowerCase() === "sell" ? "sell" : "buy",
      lots: num(r.lots) ?? 0,
      symbol: r.symbol ?? "",
      openPrice: num(r.opening_price) ?? 0,
      closePrice: num(r.closing_price) ?? 0,
      sl: num(r.stop_loss),
      tp: num(r.take_profit),
      commission,
      swap,
      profit,
      net: round2(profit + commission + swap),
      reason: (r.close_reason ?? "").toLowerCase(),
      durationMin: (+close - +open) / 60000,
    })
  }
  if (!trades.length) throw new Error("No trades found. Expected columns like opening_time_utc, closing_time_utc, profit.")
  return trades.sort((a, b) => +a.open - +b.open)
}

export const round2 = (n: number) => Math.round(n * 100) / 100

/* ---------------- timezone ---------------- */

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function parts(d: Date, tz: string) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
    fmtCache.set(tz, f)
  }
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]))
  return p as Record<string, string>
}
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
export const WEEKDAYS = WD

export function localize(trades: Trade[], tz: string): TTrade[] {
  return trades.map((t) => {
    const p = parts(t.open, tz)
    return {
      ...t,
      day: `${p.year}-${p.month}-${p.day}`,
      hour: Number(p.hour) % 24,
      weekday: WD.indexOf(p.weekday),
    }
  })
}

export function formatDateTime(d: Date, tz: string) {
  return d.toLocaleString("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
}

/* ---------------- aggregates ---------------- */

export interface Group {
  key: string
  trades: number
  wins: number
  net: number
  winRate: number
  avg: number
  grossWin: number
  grossLoss: number
}

function group(key: string, ts: { net: number }[]): Group {
  let wins = 0, net = 0, gw = 0, gl = 0
  for (const t of ts) {
    net += t.net
    if (t.net > 0) { wins++; gw += t.net } else gl += t.net
  }
  return {
    key,
    trades: ts.length,
    wins,
    net: round2(net),
    winRate: ts.length ? wins / ts.length : 0,
    avg: ts.length ? round2(net / ts.length) : 0,
    grossWin: round2(gw),
    grossLoss: round2(gl),
  }
}

export function groupBy<T extends { net: number }>(ts: T[], keyFn: (t: T) => string, order?: string[]): Group[] {
  const m = new Map<string, T[]>()
  for (const k of order ?? []) m.set(k, [])
  for (const t of ts) {
    const k = keyFn(t)
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(t)
  }
  return [...m.entries()].map(([k, v]) => group(k, v))
}

export function summary(ts: TTrade[]) {
  const g = group("all", ts)
  const wins = ts.filter((t) => t.net > 0)
  const losses = ts.filter((t) => t.net <= 0)
  const avgWin = wins.length ? g.grossWin / wins.length : 0
  const avgLoss = losses.length ? g.grossLoss / losses.length : 0

  // drawdown on close-ordered equity
  const byClose = [...ts].sort((a, b) => +a.close - +b.close)
  let cum = 0, peak = 0, maxDD = 0
  let streak = 0, maxLossStreak = 0
  for (const t of byClose) {
    cum += t.net
    peak = Math.max(peak, cum)
    maxDD = Math.min(maxDD, cum - peak)
    streak = t.net <= 0 ? streak + 1 : 0
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
    best: ts.reduce((m, t) => Math.max(m, t.net), -Infinity),
    worst: ts.reduce((m, t) => Math.min(m, t.net), Infinity),
    days,
    tradesPerDay: days ? ts.length / days : 0,
    medianDurationMin: median(ts.map((t) => t.durationMin)),
    noSL: ts.filter((t) => t.sl === null).length,
  }
}
export type Summary = ReturnType<typeof summary>

function median(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function equityCurve(ts: TTrade[]) {
  const byClose = [...ts].sort((a, b) => +a.close - +b.close)
  let cum = 0, peak = 0
  return byClose.map((t, i) => {
    cum += t.net
    peak = Math.max(peak, cum)
    return { n: i + 1, time: +t.close, equity: round2(cum), drawdown: round2(cum - peak), net: t.net }
  })
}

export function daily(ts: TTrade[]) {
  return groupBy(ts, (t) => t.day).sort((a, b) => a.key.localeCompare(b.key))
}

export const byHour = (ts: TTrade[]) =>
  groupBy(ts, (t) => String(t.hour), Array.from({ length: 24 }, (_, i) => String(i)))

export const byWeekday = (ts: TTrade[]) =>
  groupBy(ts, (t) => WD[t.weekday], WD).filter((g, i) => i < 5 || g.trades > 0)

export function heatmap(ts: TTrade[]) {
  const cells: Group[][] = WD.map((_, d) =>
    Array.from({ length: 24 }, (_, h) => group(`${d}-${h}`, ts.filter((t) => t.weekday === d && t.hour === h)))
  )
  return cells
}

/** Per day: the n-th trade of the day and its result. */
function perDay(ts: TTrade[]) {
  const m = new Map<string, TTrade[]>()
  for (const t of ts) {
    if (!m.has(t.day)) m.set(t.day, [])
    m.get(t.day)!.push(t)
  }
  for (const v of m.values()) v.sort((a, b) => +a.open - +b.open)
  return m
}

export function nthTradeOfDay(ts: TTrade[], cap = 12) {
  const rows: (TTrade & { nth: number })[] = []
  for (const day of perDay(ts).values()) day.forEach((t, i) => rows.push({ ...t, nth: i + 1 }))
  const order = Array.from({ length: cap }, (_, i) => (i + 1 === cap ? `${cap}+` : String(i + 1)))
  return groupBy(rows, (r) => (r.nth >= cap ? `${cap}+` : String(r.nth)), order).filter((g) => g.trades > 0)
}

const DAY_BUCKETS: [string, number, number][] = [
  ["1–2", 1, 2],
  ["3–5", 3, 5],
  ["6–10", 6, 10],
  ["11–15", 11, 15],
  ["16–25", 16, 25],
  ["26+", 26, Infinity],
]

export function tradesPerDayBuckets(ts: TTrade[]) {
  const days = [...perDay(ts).values()]
  return DAY_BUCKETS.map(([label, lo, hi]) => {
    const ds = days.filter((d) => d.length >= lo && d.length <= hi)
    const nets = ds.map((d) => d.reduce((s, t) => s + t.net, 0))
    const total = nets.reduce((s, x) => s + x, 0)
    return {
      key: label,
      days: ds.length,
      net: round2(total),
      avgPerDay: ds.length ? round2(total / ds.length) : 0,
      greenDays: nets.filter((x) => x > 0).length,
    }
  }).filter((b) => b.days > 0)
}

/** Net P&L if you had stopped after N trades each day. */
export function tradeCapSim(ts: TTrade[], maxCap = 25) {
  const days = [...perDay(ts).values()]
  const maxN = Math.min(maxCap, Math.max(1, ...days.map((d) => d.length)))
  const out = []
  for (let n = 1; n <= maxN; n++) {
    let net = 0, count = 0
    for (const d of days) for (const t of d.slice(0, n)) { net += t.net; count++ }
    out.push({ key: String(n), cap: n, net: round2(net), trades: count })
  }
  return out
}

/** Net P&L if you had stopped for the day once realized loss reached -limit. */
export function lossLimitSim(ts: TTrade[]) {
  const days = [...perDay(ts).values()]
  const dayLows = days.map((d) => {
    let c = 0, low = 0
    for (const t of d) { c += t.net; low = Math.min(low, c) }
    return low
  })
  const worst = Math.abs(Math.min(0, ...dayLows))
  if (!worst) return []
  const step = niceStep(worst / 12)
  const limits: number[] = []
  for (let l = step; l < worst + step; l += step) limits.push(round2(l))
  return limits.map((limit) => {
    let net = 0, count = 0, stopped = 0
    for (const d of days) {
      let c = 0
      for (const t of d) {
        c += t.net; net += t.net; count++
        if (c <= -limit) { stopped++; break }
      }
    }
    return { key: `$${limit}`, limit, net: round2(net), trades: count, stoppedDays: stopped }
  })
}

function niceStep(x: number) {
  const p = Math.pow(10, Math.floor(Math.log10(x)))
  const m = x / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

const DURATION: [string, number][] = [
  ["< 1m", 1],
  ["1–5m", 5],
  ["5–15m", 15],
  ["15–60m", 60],
  ["1–4h", 240],
  ["4h+", Infinity],
]
export const byDuration = (ts: TTrade[]) =>
  groupBy(ts, (t) => DURATION.find(([, max]) => t.durationMin < max)![0], DURATION.map((d) => d[0])).filter(
    (g) => g.trades > 0
  )

export const byLots = (ts: TTrade[]) =>
  groupBy(ts, (t) => String(t.lots)).sort((a, b) => Number(a.key) - Number(b.key))

export const REASONS: Record<string, string> = {
  sl: "Stop loss",
  tp: "Take profit",
  user: "Manual close",
  so: "Stop out (margin)",
}
export const byReason = (ts: TTrade[]) =>
  groupBy(ts, (t) => REASONS[t.reason] ?? (t.reason || "Unknown")).sort((a, b) => b.trades - a.trades)

export const bySymbol = (ts: TTrade[]) => groupBy(ts, (t) => t.symbol).sort((a, b) => b.trades - a.trades)
export const bySide = (ts: TTrade[]) => groupBy(ts, (t) => (t.side === "buy" ? "Buy" : "Sell"), ["Buy", "Sell"])

/** Trades opened shortly after a losing trade closed vs. the rest. */
export function revenge(ts: TTrade[], windowMin = 10) {
  const byClose = [...ts].sort((a, b) => +a.close - +b.close)
  const after: TTrade[] = []
  const other: TTrade[] = []
  for (const t of ts) {
    const prevLoss = byClose.some(
      (p) => p !== t && p.net < 0 && +p.close <= +t.open && +t.open - +p.close <= windowMin * 60000
    )
    ;(prevLoss ? after : other).push(t)
  }
  return { windowMin, after: group("after", after), other: group("other", other) }
}
