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
