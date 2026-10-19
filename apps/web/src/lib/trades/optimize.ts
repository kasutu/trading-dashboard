import type { Group, LocalTrade } from "./types"
import { group, perDay, round2, sumNet } from "./group"
import { byDuration, byHour, bySymbol, byWeekday, daily } from "./stats"
import { lossLimitSim } from "./simulate"
import { WEEKDAYS } from "./time"

export type Rules = {
  skipHours: number[]
  skipWeekdays: number[]
  /** Max trades per day. null = no cap. */
  cap: number | null
  /** Stop for the day once the day's loss reaches this. null = no limit. */
  lossLimit: number | null
}

const NO_RULES: Rules = { skipHours: [], skipWeekdays: [], cap: null, lossLimit: null }
const MIN_TRADES = 5 // an hour or weekday needs this many trades before we skip it
const TRAIN_SHARE = 0.7
const MIN_KEEP = 0.4 // rules must keep 40% of trades, so "stop trading" is never the answer

/**
 * Trades you would have taken under the rules.
 * ponytail: assumes trades are independent, so a skipped trade does not change later ones.
 */
export function applyRules(ts: LocalTrade[], r: Rules): LocalTrade[] {
  const kept: LocalTrade[] = []
  for (const day of perDay(ts)) {
    let n = 0, dayNet = 0
    for (const t of day) {
      if (r.skipHours.includes(t.hour) || r.skipWeekdays.includes(t.weekday)) continue
      if ((r.cap !== null && n >= r.cap) || (r.lossLimit !== null && dayNet <= -r.lossLimit)) break
      kept.push(t)
      n++
      dayNet += t.net
    }
  }
  return kept
}

/**
 * Find the rules with the best net P&L on the training days.
 * Skips: losing hours and weekdays are added one at a time, worst first.
 * Cap and loss limit: full grid search on top of each skip set.
 * Every rule set must keep MIN_KEEP of the trades. Looser rules win ties.
 */
function fit(train: LocalTrade[]) {
  const minKept = Math.ceil(train.length * MIN_KEEP)
  const candidates = [
    ...byHour(train).map((g) => ({ ...g, apply: (r: Rules) => r.skipHours.push(Number(g.key)) })),
    ...byWeekday(train).map((g) => ({ ...g, apply: (r: Rules) => r.skipWeekdays.push(WEEKDAYS.indexOf(g.key)) })),
  ]
    .filter((g) => g.trades >= MIN_TRADES && g.net < 0)
    .sort((a, b) => a.net - b.net)

  const bases: Rules[] = [NO_RULES]
  for (const c of candidates) {
    const next = { ...bases.at(-1)!, skipHours: [...bases.at(-1)!.skipHours], skipWeekdays: [...bases.at(-1)!.skipWeekdays] }
    c.apply(next)
    if (applyRules(train, next).length < minKept) break
    bases.push(next)
  }

  let best = NO_RULES
  let bestNet = sumNet(train)
  let tested = 0
  for (const base of bases) {
    const filtered = applyRules(train, base)
    const maxPerDay = Math.max(1, ...perDay(filtered).map((d) => d.length))
    const caps = [null, ...Array.from({ length: maxPerDay }, (_, i) => maxPerDay - i)]
    const limits = [null, ...lossLimitSim(filtered).map((l) => l.limit).reverse()]
    for (const cap of caps)
      for (const lossLimit of limits) {
        const r = { ...base, cap, lossLimit }
        const kept = applyRules(train, r)
        tested++
        if (kept.length < minKept) continue
        const net = sumNet(kept)
        if (net > bestNet + 0.005) { best = r; bestNet = net }
      }
  }
  return { rules: best, tested }
}

const FOCUS = [
  { kind: "hour", by: byHour, top: 3 },
  { kind: "weekday", by: byWeekday, top: 2 },
  { kind: "symbol", by: bySymbol, top: 1 },
  { kind: "duration", by: byDuration, top: 1 },
] as const

const merge = (gs: Group[]) => {
  const trades = gs.reduce((s, g) => s + g.trades, 0)
  const wins = gs.reduce((s, g) => s + g.wins, 0)
  return { trades, net: round2(gs.reduce((s, g) => s + g.net, 0)), winRate: trades ? wins / trades : 0 }
}

/** What made money on the fit days (top hours, weekdays, symbol, holding time), and how it did on the test days. */
function focus(train: LocalTrade[], test: LocalTrade[]) {
  return FOCUS.flatMap(({ kind, by, top }) => {
    const picks = by(train)
      .filter((g) => g.trades >= MIN_TRADES && g.net > 0)
      .sort((a, b) => b.net - a.net)
      .slice(0, top)
    if (!picks.length) return []
    const keys = picks.map((g) => g.key)
    if (kind === "hour") keys.sort((a, b) => Number(a) - Number(b))
    return [{ kind, keys, fit: merge(picks), test: merge(by(test).filter((g) => keys.includes(g.key))) }]
  })
}
export type FocusItem = ReturnType<typeof focus>[number]

function compare(ts: LocalTrade[], r: Rules) {
  const kept = applyRules(ts, r)
  return { actual: group("actual", ts), withRules: group("rules", kept) }
}
export type Comparison = ReturnType<typeof compare>

/** Fit rules on the first 70% of days, then test them on the rest. Returns null with too little data. */
export function optimize(ts: LocalTrade[]) {
  const dayKeys = [...new Set(ts.map((t) => t.day))].sort()
  if (dayKeys.length < 10 || ts.length < 30) return null

  const splitDay = dayKeys[Math.floor(dayKeys.length * TRAIN_SHARE)]
  const train = ts.filter((t) => t.day < splitDay)
  const test = ts.filter((t) => t.day >= splitDay)
  const { rules, tested } = fit(train)

  // Cumulative daily net, actual vs with rules
  const ruled = new Map(daily(applyRules(ts, rules)).map((d) => [d.key, d.net]))
  let a = 0, b = 0
  const curve = daily(ts).map((d) => {
    a += d.net
    b += ruled.get(d.key) ?? 0
    return { key: d.key, actual: Math.round(a * 100) / 100, rules: Math.round(b * 100) / 100 }
  })

  return {
    focus: focus(train, test),
    rules,
    tested,
    splitDay,
    trainDays: [dayKeys[0], dayKeys[dayKeys.indexOf(splitDay) - 1]] as const,
    testDays: [splitDay, dayKeys.at(-1)!] as const,
    train: compare(train, rules),
    test: compare(test, rules),
    all: compare(ts, rules),
    curve,
  }
}
export type Optimization = NonNullable<ReturnType<typeof optimize>>
