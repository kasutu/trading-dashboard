export const money = (n: number, sign = false) => {
  const s = Math.abs(n).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (n < 0) return `-${s}`
  return sign && n > 0 ? `+${s}` : s
}
export const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`
export const pnlClass = (n: number) => (n > 0 ? "text-profit" : n < 0 ? "text-loss" : "text-muted-foreground")
export const hourLabel = (h: number | string) => `${String(h).padStart(2, "0")}:00`
export const duration = (min: number) =>
  min < 1 ? `${Math.round(min * 60)}s` : min < 60 ? `${Math.round(min)}m` : `${(min / 60).toFixed(1)}h`
