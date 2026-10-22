// Time math for the day timeline: where a trade sits on its day, in the dashboard timezone.

/** A trade on the timeline. `start` and `end` are minutes from midnight of the day. */
export type Span = { id: string; start: number; end: number; net: number }

const parts = (iso: string, tz: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, Number(x.value)])
  )
  return p as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>
}

/** Minutes from midnight of `day` (yyyy-mm-dd in `tz`) to an ISO time. Past midnight goes over 1440. */
export function minutesInto(iso: string, day: string, tz: string) {
  const p = parts(iso, tz)
  const [y, m, d] = day.split("-").map(Number)
  const days = (Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(y, m - 1, d)) / 86400000
  return days * 1440 + p.hour * 60 + p.minute + p.second / 60
}

export const toSpan = (t: { id: string; open: string; close: string; net: number }, day: string, tz: string): Span => {
  const start = minutesInto(t.open, day, tz)
  return { id: t.id, start, end: Math.max(start, minutesInto(t.close, day, tz)), net: t.net }
}

/** The hours the axis shows: whole hours around the spans, at least `min` hours wide. */
export function hourWindow(spans: Span[], min = 2) {
  if (!spans.length) return { from: 0, to: 1440 }
  let from = Math.floor(Math.min(...spans.map((s) => s.start)) / 60) * 60
  let to = Math.ceil(Math.max(...spans.map((s) => s.end)) / 60) * 60
  if (to - from < min * 60) {
    const pad = (min * 60 - (to - from)) / 2
    from = Math.max(0, Math.floor((from - pad) / 60) * 60)
    to = from + min * 60
  }
  return { from, to }
}

/** Hour marks for an axis: every 1, 2, 3, 4 or 6 hours, so there are 7 marks or fewer. */
export function hourTicks({ from, to }: { from: number; to: number }) {
  const hours = (to - from) / 60
  const step = [1, 2, 3, 4, 6].find((s) => hours / s <= 6) ?? 12
  const out: number[] = []
  for (let m = Math.ceil(from / 60 / step) * step * 60; m <= to; m += step * 60) out.push(m)
  return out
}

/** Minutes past midnight as a short clock label: 540 → "9a", 1440 → "12a". */
export const clockShort = (min: number) => {
  const h = Math.floor(min / 60) % 24
  return `${h % 12 || 12}${h < 12 ? "a" : "p"}`
}

/** Spans in rows so no two in a row overlap. Opens first; each span takes the first free row. */
export function lanes<T extends Span>(spans: T[]) {
  const ends: number[] = []
  return [...spans]
    .sort((a, b) => a.start - b.start)
    .map((s) => {
      let lane = ends.findIndex((e) => e <= s.start)
      if (lane < 0) lane = ends.length
      ends[lane] = s.end
      return { ...s, lane }
    })
}

/** The time with at least one trade open, as merged spans. Same as the engine's time in the market. */
export function inMarket(spans: Span[]) {
  const out: { start: number; end: number }[] = []
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    const last = out.at(-1)
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end)
    else out.push({ start: s.start, end: s.end })
  }
  return out
}
