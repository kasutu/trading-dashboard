import type { CashSummary } from "@/lib/api/types"
export const money = (n: number, sign = false) => {
  const s = Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (n < 0) return `−${s}`
  return sign && n > 0 ? `+${s}` : s
}

/** Short axis label: 1.2k, -350 */
export const compactMoney = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))

export const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`
export const pnlClass = (n: number) => (n > 0 ? "text-profit" : n < 0 ? "text-loss" : "text-muted-foreground")
/** 12-hour clock: 0 → "12 AM", 13 → "1 PM" */
export const hourLabel = (h: number | string) => {
  const n = Number(h)
  return `${n % 12 || 12} ${n < 12 ? "AM" : "PM"}`
}
/** "a", "a and b", "a, b and c". */
export const andList = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`)

/** Hours as ranges: [20, 21, 22, 9] → "9 AM and 8 PM to 11 PM". A range ends when its last hour ends. */
export function hourList(hours: number[]) {
  const sorted = [...new Set(hours)].sort((a, b) => a - b)
  const runs: [number, number][] = []
  for (const h of sorted) {
    const last = runs.at(-1)
    if (last && h === last[1] + 1) last[1] = h
    else runs.push([h, h])
  }
  return andList(runs.map(([a, b]) => (a === b ? hourLabel(a) : `${hourLabel(a)} to ${hourLabel((b + 1) % 24)}`)))
}

export const LONG_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
/** "Mon" → "Monday". */
export const longWeekday = (short: string) => LONG_WEEKDAYS[WEEKDAYS.indexOf(short)] ?? short

/** Short 12-hour label for axes: 0 → "12am", 13 → "1pm" */
export const hourShort = (h: number | string) => {
  const n = Number(h) % 24
  return `${n % 12 || 12}${n < 12 ? "am" : "pm"}`
}
/** Hold time in words: "45 sec", "12 min", "1 hr 24 min", "2 days 3 hr". */
export function duration(min: number) {
  if (min < 1) return `${Math.max(1, Math.round(min * 60))} sec`
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), r = m % 60
  if (d) return `${plural(d, "day")}${h ? ` ${h} hr` : ""}`
  return `${h} hr${r ? ` ${r} min` : ""}`
}
export const ordinal = (n: number) => {
  const t = n % 100
  const s = t >= 11 && t <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"
  return `${n}${s}`
}
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

/** "2026-10-19" → "Oct 19", or "Mon, Oct 19" with the weekday. */
export function formatDay(day: string, weekday = false) {
  return new Date(day + "T00:00").toLocaleDateString("en-US", {
    weekday: weekday ? "short" : undefined,
    month: "short",
    day: "numeric",
  })
}

/** "2026-10" → "Oct 2026", or "October 2026" with `long`. */
export const formatMonth = (month: string, long = false) =>
  new Date(month + "-01T00:00").toLocaleDateString("en-US", { month: long ? "long" : "short", year: "numeric" })

/** ["2026-08-03", "2026-10-01"] → "Aug 3 – Oct 1" */
const toDate = (day: string) => new Date(day + "T00:00")
const isThisYear = (day: string) => day.slice(0, 4) === String(new Date().getFullYear())

/** A span of days: "Aug 3 – Oct 1", with the year only when it is not this year. */
export function formatPeriod([a, b]: [string, string]) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
  if (!isThisYear(a) || !isThisYear(b)) opts.year = "numeric"
  return new Intl.DateTimeFormat("en-US", opts).formatRange(toDate(a), toDate(b))
}

/** "2026-10-19" → "Monday, October 19, 2026" */
export const formatLongDay = (day: string) =>
  toDate(day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })

/** A day the way Apple writes it: "Today", "Yesterday", "Monday" (this week), "Mon, Oct 19",
 *  or "Mon, Oct 19, 2025" in another year. */
export function relativeDay(day: string, tz: string) {
  const now = today(tz)
  const diff = Math.round((+toDate(now) - +toDate(day)) / 86400000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  if (diff > 1 && diff < 7) return toDate(day).toLocaleDateString("en-US", { weekday: "long" })
  return toDate(day).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: isThisYear(day) ? undefined : "numeric",
  })
}

/** ISO time → "9:05 PM" in the timezone. */
export const formatTime = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })

/** yyyy-mm-dd of an ISO time in the timezone. */
const dayOf = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz })

/** ISO time → "Today, 9:05 PM", "Yesterday, 9:05 PM" or "Mon, Oct 19, 9:05 PM". */
export const formatDateTime = (iso: string, tz: string) => `${relativeDay(dayOf(iso, tz), tz)}, ${formatTime(iso, tz)}`

/** Open to close: "9:05 – 9:19 PM" on one day, "9:05 PM – Oct 20, 2:24 AM" across days. */
export function formatTimeRange(startIso: string, endIso: string, tz: string) {
  const sameDay = dayOf(startIso, tz) === dayOf(endIso, tz)
  const opts: Intl.DateTimeFormatOptions = sameDay
    ? { timeZone: tz, hour: "numeric", minute: "2-digit" }
    : { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
  return new Intl.DateTimeFormat("en-US", opts).formatRange(new Date(startIso), new Date(endIso))
}

/** A timezone as people say it: "Manila (GMT+8)", "New York (GMT-4)", "UTC". */
export function tzLabel(tz: string) {
  if (tz === "UTC") return "UTC"
  const city = tz.split("/").pop()!.replace(/_/g, " ")
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value
  return offset ? `${city} (${offset})` : city
}

/** Today as yyyy-mm-dd in the timezone. */
export const today = (tz: string) => new Date().toLocaleDateString("en-CA", { timeZone: tz })

/** Cash flow kinds as the app names them. */
/** Internal transfers in and out: "in $350.00, out $420.00". */
export function transfers(s: Pick<CashSummary, "transfersIn" | "transfersOut">) {
  return [s.transfersIn.count && `in ${money(s.transfersIn.total)}`, s.transfersOut.count && `out ${money(s.transfersOut.total)}`]
    .filter(Boolean)
    .join(", ")
}

export const FLOW_LABELS = { deposit: "Deposit", withdrawal: "Withdrawal", adjustment: "Adjustment" } as const

export const REASONS: Record<string, string> = { sl: "Stop loss", tp: "Take profit", user: "Manual", so: "Stop-out" }
export const reasonLabel = (r: string) => REASONS[r] ?? (r || "Unknown")

/** Position sizes are keyed per symbol: "XAUUSD · 0.2". */
export const splitSizeKey = (key: string) => {
  const [symbol, lots] = key.split(" · ")
  return { symbol, lots }
}
export const sizeLabel = (key: string) => {
  const { symbol, lots } = splitSizeKey(key)
  return `${lots} lots on ${symbol}`
}

/** Price without trailing zeros, or "—" when empty. */
export const price = (n: number | null) => (n === null ? "—" : String(+n.toFixed(5)))

/** A unique key for a trade row. Partial closes share a ticket, so the ticket alone is not enough. */
export const tradeKey = (t: { ticket: string; close: string; lots: number; closePrice: number }) =>
  `${t.ticket}|${t.close}|${t.lots}|${t.closePrice}`
