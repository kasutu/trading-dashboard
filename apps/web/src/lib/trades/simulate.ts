import type { LocalTrade, Trade } from "./types"
import { group, groupBy, perDay, round2, sumNet } from "./group"

/** Result of the 1st, 2nd, ... trade of each day. */
export function nthTradeOfDay(ts: LocalTrade[], cap = 12) {
  const label = (n: number) => (n >= cap ? `${cap}+` : String(n))
  const rows = perDay(ts).flatMap((day) => day.map((t, i) => ({ net: t.net, nth: i + 1 })))
  const order = Array.from({ length: cap }, (_, i) => label(i + 1))
  return groupBy(rows, (r) => label(r.nth), order).filter((g) => g.trades > 0)
}

const DAY_BUCKETS: [string, number, number][] = [
  ["1–2", 1, 2],
  ["3–5", 3, 5],
  ["6–10", 6, 10],
  ["11–15", 11, 15],
  ["16–25", 16, 25],
  ["26+", 26, Infinity],
]

/** Average daily result, grouped by how many trades were taken that day. */
export function tradesPerDayBuckets(ts: LocalTrade[]) {
  const days = perDay(ts)
  return DAY_BUCKETS.map(([label, lo, hi]) => {
    const nets = days.filter((d) => d.length >= lo && d.length <= hi).map(sumNet)
    const total = sumNet(nets.map((net) => ({ net })))
    return {
      key: label,
      days: nets.length,
      net: round2(total),
      avgPerDay: nets.length ? round2(total / nets.length) : 0,
      greenDays: nets.filter((x) => x > 0).length,
    }
  }).filter((b) => b.days > 0)
}

/** Net P&L if you stopped after N trades each day. */
export function tradeCapSim(ts: LocalTrade[], maxCap = 25) {
  const days = perDay(ts)
  const maxN = Math.min(maxCap, Math.max(1, ...days.map((d) => d.length)))
  return Array.from({ length: maxN }, (_, i) => {
    const kept = days.flatMap((d) => d.slice(0, i + 1))
    return { key: String(i + 1), cap: i + 1, net: round2(sumNet(kept)), trades: kept.length }
  })
}

/** Net P&L if you stopped for the day once the day's loss reached the limit. */
export function lossLimitSim(ts: LocalTrade[]) {
  const days = perDay(ts)
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

/** Trades opened soon after a losing trade closed, compared with all other trades. */
export function afterLoss(ts: Trade[], windowMin = 10) {
  const losses = ts.filter((t) => t.net < 0)
  const after: Trade[] = []
  const other: Trade[] = []
  for (const t of ts) {
    // ponytail: O(trades × losses) scan, fine for a few thousand trades
    const hit = losses.some((p) => p !== t && +p.close <= +t.open && +t.open - +p.close <= windowMin * 60000)
    ;(hit ? after : other).push(t)
  }
  return { windowMin, after: group("after", after), other: group("other", other) }
}
