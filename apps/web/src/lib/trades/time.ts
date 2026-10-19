import type { LocalTrade, Trade } from "./types"

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

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
  return Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>
}

export function localize(trades: Trade[], tz: string): LocalTrade[] {
  return trades.map((t) => {
    const p = parts(t.open, tz)
    return {
      ...t,
      day: `${p.year}-${p.month}-${p.day}`,
      hour: Number(p.hour) % 24,
      weekday: WEEKDAYS.indexOf(p.weekday),
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
    hour12: true,
  })
}

export function formatDay(day: string, weekday = false) {
  return new Date(day + "T00:00").toLocaleDateString("en-US", {
    weekday: weekday ? "short" : undefined,
    month: "short",
    day: "numeric",
  })
}
