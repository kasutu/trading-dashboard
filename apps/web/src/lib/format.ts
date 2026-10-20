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
/** Short 12-hour label for tight axes: 0 → "12a", 13 → "1p" */
export const hourShort = (h: number | string) => {
  const n = Number(h)
  return `${n % 12 || 12}${n < 12 ? "a" : "p"}`
}
export const duration = (min: number) =>
  min < 1 ? `${Math.round(min * 60)}s` : min < 60 ? `${Math.round(min)}m` : `${(min / 60).toFixed(1)}h`
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

/** ["2026-08-03", "2026-10-01"] → "Aug 3 – Oct 1" */
export function formatPeriod([a, b]: [string, string]) {
  return a === b ? formatDay(a) : `${formatDay(a)} – ${formatDay(b)}`
}

/** "2026-10-19" → "Monday, October 19, 2026" */
export const formatLongDay = (day: string) =>
  new Date(day + "T00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })

/** ISO time → "Oct 19, 09:05 AM" in the timezone. */
export const formatDateTime = (iso: string, tz: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })

/** ISO time → "9:05 AM" in the timezone. */
export const formatTime = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })

/** Today as yyyy-mm-dd in the timezone. */
export const today = (tz: string) => new Date().toLocaleDateString("en-CA", { timeZone: tz })

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
