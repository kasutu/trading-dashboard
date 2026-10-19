import { hourLabel, hourShort, money, ordinal, pct } from "@/lib/format"
import * as T from "@/lib/trades"

export type Insight = {
  tone: "good" | "bad" | "info"
  title: string
  /** The key number. The UI highlights it. */
  figure: string
  detail: string
  viz?: Viz
}

/** A small chart for the note. "bars": one bar per group, with the groups the note is about highlighted.
 *  "compare": horizontal bars for two or more values. */
export type Viz =
  | { kind: "bars"; bars: { label: string; value: number; on: boolean }[] }
  | { kind: "compare"; rows: { label: string; value: number; on: boolean }[] }

const bars = (gs: T.Group[], on: (g: T.Group) => boolean, label: (k: string) => string = (k) => k): Viz => ({
  kind: "bars",
  bars: gs.map((g) => ({ label: label(g.key), value: g.net, on: on(g) })),
})
const compare = (rows: [string, number, boolean][]): Viz => ({
  kind: "compare",
  rows: rows.map(([label, value, on]) => ({ label, value, on })),
})

const MIN = 5 // ignore groups with fewer trades than this

const pick = (gs: T.Group[], dir: 1 | -1) =>
  gs.filter((g) => g.trades >= MIN).sort((a, b) => dir * (b.net - a.net))[0]

/** Plain-language findings from a set of trades. Returns [] for fewer than 10 trades. */
export function buildInsights(ts: T.LocalTrade[]): Insight[] {
  const out: Insight[] = []
  if (ts.length < 10) return out
  const actual = T.sumNet(ts)

  const hours = T.byHour(ts)
  const worstH = pick(hours, -1)
  if (worstH && worstH.net < 0)
    out.push({
      tone: "bad",
      title: "Worst hour",
      figure: hourLabel(worstH.key),
      detail: `${money(worstH.net, true)} over ${worstH.trades} trades, ${pct(worstH.winRate)} win rate.`,
      viz: bars(hours, (g) => g === worstH, hourShort),
    })
  const bestH = pick(hours, 1)
  if (bestH && bestH.net > 0)
    out.push({
      tone: "good",
      title: "Best hour",
      figure: hourLabel(bestH.key),
      detail: `${money(bestH.net, true)} over ${bestH.trades} trades, ${pct(bestH.winRate)} win rate.`,
      viz: bars(hours, (g) => g === bestH, hourShort),
    })

  const losingHours = hours.filter((h) => h.trades >= 3 && h.net < 0)
  if (losingHours.length)
    out.push({
      tone: "info",
      title: `Skip ${losingHours.length} losing hour${losingHours.length > 1 ? "s" : ""}`,
      figure: money(-T.sumNet(losingHours), true),
      detail: `These hours lost money: ${losingHours.map((h) => hourLabel(h.key)).join(", ")}.`,
      viz: bars(hours, (g) => losingHours.includes(g), hourShort),
    })

  const weekdays = T.byWeekday(ts)
  const bestD = pick(weekdays, 1)
  if (bestD && bestD.net > 0)
    out.push({
      tone: "good",
      title: "Best weekday",
      figure: bestD.key,
      detail: `${money(bestD.net, true)} over ${bestD.trades} trades, ${pct(bestD.winRate)} win rate.`,
      viz: bars(weekdays, (g) => g === bestD),
    })
  const worstD = pick(weekdays, -1)
  if (worstD && worstD.net < 0)
    out.push({
      tone: "bad",
      title: "Worst weekday",
      figure: worstD.key,
      detail: `${money(worstD.net, true)} over ${worstD.trades} trades, ${pct(worstD.winRate)} win rate.`,
      viz: bars(weekdays, (g) => g === worstD),
    })

  const days = T.daily(ts)
  const bestDay = T.best(days)
  const worstDay = T.best(days.map((d) => ({ ...d, net: -d.net })))
  if (bestDay && bestDay.net > 0)
    out.push({
      tone: "good",
      title: "Best day",
      figure: T.formatDay(bestDay.key, true),
      detail: `${money(bestDay.net, true)} over ${bestDay.trades} trades, ${pct(bestDay.winRate)} win rate.`,
      viz: bars(days, (g) => g.key === bestDay.key, (k) => T.formatDay(k)),
    })
  if (worstDay && worstDay.net > 0)
    out.push({
      tone: "bad",
      title: "Worst day",
      figure: T.formatDay(worstDay.key, true),
      detail: `${money(-worstDay.net, true)} over ${worstDay.trades} trades, ${pct(worstDay.winRate)} win rate.`,
      viz: bars(days, (g) => g.key === worstDay.key, (k) => T.formatDay(k)),
    })

  const cap = T.best(T.tradeCapSim(ts))
  if (cap && cap.net > actual + 0.01)
    out.push({
      tone: "good",
      title: `Stop after ${cap.cap} trade${cap.cap > 1 ? "s" : ""} a day`,
      figure: `${money(cap.net - actual, true)} saved`,
      detail: `Net P&L goes from ${money(actual, true)} to ${money(cap.net, true)}. Trades after the ${ordinal(cap.cap)} of the day lost money.`,
      viz: compare([["Actual", actual, false], [`Cap at ${cap.cap}`, cap.net, true]]),
    })

  const limit = T.best(T.lossLimitSim(ts))
  if (limit && limit.net > actual + 0.01)
    out.push({
      tone: "good",
      title: `Stop for the day at −$${limit.limit}`,
      figure: `${money(limit.net - actual, true)} saved`,
      detail: `Net P&L goes from ${money(actual, true)} to ${money(limit.net, true)}. The limit stops ${limit.stoppedDays} days early.`,
      viz: compare([["Actual", actual, false], [`Stop at −$${limit.limit}`, limit.net, true]]),
    })

  const al = T.afterLoss(ts)
  if (al.after.trades >= MIN && al.after.avg < al.other.avg)
    out.push({
      tone: "bad",
      title: "Trades right after a loss",
      figure: `${money(al.after.avg, true)} / trade`,
      detail: `${al.after.trades} trades opened within ${al.windowMin} min of a loss, ${pct(al.after.winRate)} win rate. Other trades: ${money(al.other.avg, true)} / trade.`,
      viz: compare([["After a loss", al.after.avg, true], ["Other trades", al.other.avg, false]]),
    })

  const dur = T.byDuration(ts).filter((g) => g.trades >= MIN)
  const bestDur = pick(dur, 1)
  const worstDur = pick(dur, -1)
  if (bestDur && worstDur && bestDur.net > 0 && worstDur.net < 0)
    out.push({
      tone: "info",
      title: "Best holding time",
      figure: bestDur.key,
      detail: `${money(bestDur.net, true)} over ${bestDur.trades} trades. Holds of ${worstDur.key}: ${money(worstDur.net, true)}.`,
      viz: bars(T.byDuration(ts), (g) => g.key === bestDur.key),
    })

  const so = T.byReason(ts).find((r) => r.key === T.REASONS.so)
  if (so)
    out.push({
      tone: "bad",
      title: "Margin stop-outs",
      figure: String(so.trades),
      detail: `Stop-outs cost ${money(so.net, true)}. The position size was too large for the account balance.`,
      viz: bars(T.byReason(ts), (g) => g === so),
    })

  const lots = T.byLots(ts).filter((g) => g.trades >= MIN)
  const worstLot = [...lots].sort((a, b) => a.avg - b.avg)[0]
  if (worstLot && worstLot.net < 0 && lots.length > 1)
    out.push({
      tone: "info",
      title: "Worst position size",
      figure: T.sizeLabel(worstLot.key),
      detail: `${money(worstLot.net, true)} over ${worstLot.trades} trades, ${money(worstLot.avg, true)} / trade. The chart shows each size on ${T.splitSizeKey(worstLot.key).symbol}.`,
      viz: bars(
        T.byLots(ts.filter((t) => t.symbol === T.splitSizeKey(worstLot.key).symbol)),
        (g) => g.key === worstLot.key,
        (k) => T.splitSizeKey(k).lots
      ),
    })

  return out
}
