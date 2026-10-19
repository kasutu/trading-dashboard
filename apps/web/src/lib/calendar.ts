// Plain calendar math on "yyyy-mm-dd" days and "yyyy-mm" months. Uses UTC so no timezone shifts a day.

const toDate = (day: string) => new Date(day + "T00:00Z")
const toKey = (d: Date) => d.toISOString().slice(0, 10)

export const monthOf = (day: string) => day.slice(0, 7)

export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number)
  return toKey(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7)
}

/** "2026-10" → "October 2026" */
export const monthTitle = (month: string) =>
  toDate(month + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })

/** The days shown for a month: whole weeks, Monday to Sunday. */
export function monthGrid(month: string) {
  const [y, m] = month.split("-").map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const last = new Date(Date.UTC(y, m, 0))
  const start = Date.UTC(y, m - 1, 1 - ((first.getUTCDay() + 6) % 7))
  const end = Date.UTC(y, m - 1, last.getUTCDate() + (6 - ((last.getUTCDay() + 6) % 7)))
  const days: string[] = []
  for (let t = start; t <= end; t += 86400000) days.push(toKey(new Date(t)))
  return days
}
