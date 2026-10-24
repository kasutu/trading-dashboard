import type { FullAnalytics, Group } from "@/lib/api/types"
import { REASONS, hourLabel, hourList, hourShort, longWeekday, money, ordinal, plural, splitSizeKey } from "@/lib/format"
import { best } from "@/lib/utils"

export type Insight = {
  tone: "good" | "bad" | "info"
  title: string
  /** The key number, shown large. */
  figure: string
  detail: string
  viz?: Viz
}

/** A small chart for the note. "bars": one bar per group, with the groups the note is about highlighted.
 *  "compare": horizontal bars for two or more values. */
export type Viz =
  | { kind: "bars"; bars: { label: string; value: number; on: boolean }[] }
  | { kind: "compare"; rows: { label: string; value: number; on: boolean }[] }

const bars = (gs: Group[], on: (g: Group) => boolean, label: (k: string) => string = (k) => k): Viz => ({
  kind: "bars",
  bars: gs.map((g) => ({ label: label(g.key), value: g.net, on: on(g) })),
})
const compare = (rows: [string, number, boolean][]): Viz => ({
  kind: "compare",
  rows: rows.map(([label, value, on]) => ({ label, value, on })),
})

const MIN = 5 // ignore groups with fewer trades than this

const pick = (gs: Group[], dir: 1 | -1) =>
  gs.filter((g) => g.trades >= MIN).sort((a, b) => dir * (b.net - a.net))[0]

const sum = (gs: Group[]) => gs.reduce((s, g) => s + g.net, 0)
const count = (gs: Group[]) => gs.reduce((s, g) => s + g.trades, 0)
/** "made you +$140.00" or "lost you $90.00". */
const result = (net: number) => (net >= 0 ? `made you ${money(net, true)}` : `lost you ${money(-net)}`)
const won = (g: Group) => `You won ${g.wins} of ${g.trades}.`

/** Advice from the analytics payload: each note is one action, its key number, and the fact behind it.
 *  Returns [] for fewer than 10 trades. */
export function buildInsights(a: FullAnalytics): Insight[] {
  const out: Insight[] = []
  if (a.summary.trades < 10) return out
  const actual = a.summary.net

  const hours = a.byHour
  const losingHours = hours.filter((h) => h.trades >= 3 && h.net < 0)
  if (losingHours.length)
    out.push({
      tone: "bad",
      title: `Avoid ${hourList(losingHours.map((h) => Number(h.key)))}`,
      figure: money(sum(losingHours), true),
      detail: `${losingHours.length > 1 ? "These hours" : "This hour"} ${result(sum(losingHours))} in ${plural(count(losingHours), "trade")}.`,
      viz: bars(hours, (g) => losingHours.includes(g), hourShort),
    })
  const bestH = pick(hours, 1)
  if (bestH && bestH.net > 0)
    out.push({
      tone: "good",
      title: `Trade at ${hourLabel(bestH.key)}`,
      figure: money(bestH.net, true),
      detail: `${hourLabel(bestH.key)} ${result(bestH.net)}. ${won(bestH)}`,
      viz: bars(hours, (g) => g === bestH, hourShort),
    })

  const weekdays = a.byWeekday
  const bestD = pick(weekdays, 1)
  if (bestD && bestD.net > 0)
    out.push({
      tone: "good",
      title: `Trade on ${longWeekday(bestD.key)}s`,
      figure: money(bestD.net, true),
      detail: `${longWeekday(bestD.key)}s ${result(bestD.net)} in ${plural(bestD.trades, "trade")}.`,
      viz: bars(weekdays, (g) => g === bestD),
    })
  const worstD = pick(weekdays, -1)
  if (worstD && worstD.net < 0)
    out.push({
      tone: "bad",
      title: `Avoid ${longWeekday(worstD.key)}s`,
      figure: money(worstD.net, true),
      detail: `${longWeekday(worstD.key)}s ${result(worstD.net)} in ${plural(worstD.trades, "trade")}.`,
      viz: bars(weekdays, (g) => g === worstD),
    })

  const cap = best(a.capSim)
  if (cap && cap.net > actual + 0.01)
    out.push({
      tone: "good",
      title: `Stop after ${plural(cap.cap, "trade")} a day`,
      figure: money(cap.net - actual, true),
      detail: `You would have ${money(cap.net - actual)} more. Trades after your ${ordinal(cap.cap)} each day lost money.`,
      viz: compare([["Actual", actual, false], [`Cap at ${cap.cap}`, cap.net, true]]),
    })

  const limit = best(a.lossLimitSim)
  if (limit && limit.net > actual + 0.01)
    out.push({
      tone: "good",
      title: `Stop at −$${limit.limit} a day`,
      figure: money(limit.net - actual, true),
      detail: `You would have ${money(limit.net - actual)} more. You would stop early on ${plural(limit.stoppedDays, "day")}.`,
      viz: compare([["Actual", actual, false], [`Stop at −$${limit.limit}`, limit.net, true]]),
    })

  const al = a.afterLoss
  if (al.after.trades >= MIN && al.after.avg < al.other.avg)
    out.push({
      tone: "bad",
      title: `Wait ${al.windowMin} min after a loss`,
      figure: `${money(al.after.avg, true)} a trade`,
      detail: `Trades within ${al.windowMin} min of a loss averaged ${money(al.after.avg, true)}. Other trades averaged ${money(al.other.avg, true)}.`,
      viz: compare([["After a loss", al.after.avg, true], ["Other trades", al.other.avg, false]]),
    })

  // Overtrading: compare the average day over the limit with the other days. Needs a few of each.
  const ot = a.overtrading
  if (ot.best && ot.over.trades >= 3 && ot.within.trades >= 3) {
    const worse = ot.over.avg < ot.within.avg
    out.push({
      tone: worse ? "bad" : "info",
      title: worse ? "Trade less on busy days" : "Keep your pace on busy days",
      figure: `${money(ot.over.avg, true)} a day`,
      detail: `Busy days averaged ${money(ot.over.avg, true)}. Other days averaged ${money(ot.within.avg, true)}. See Frequency.`,
      viz: compare([["Days over", ot.over.avg, true], ["Other days", ot.within.avg, false]]),
    })
  }

  const dur = a.byDuration.filter((g) => g.trades >= MIN)
  const bestDur = pick(dur, 1)
  const worstDur = pick(dur, -1)
  if (bestDur && worstDur && bestDur.net > 0 && worstDur.net < 0)
    out.push({
      tone: "info",
      title: `Hold for ${bestDur.key}`,
      figure: money(bestDur.net, true),
      detail: `These trades ${result(bestDur.net)}. Holds of ${worstDur.key} ${result(worstDur.net)}.`,
      viz: bars(a.byDuration, (g) => g.key === bestDur.key),
    })

  const so = a.byReason.find((r) => r.key === REASONS.so)
  if (so)
    out.push({
      tone: "bad",
      title: "Use smaller positions",
      figure: plural(so.trades, "stop-out"),
      detail: `Margin stop-outs ${result(so.net)}. Your size was too big for your balance.`,
      viz: bars(a.byReason, (g) => g === so),
    })

  const lots = a.byLots.filter((g) => g.trades >= MIN)
  const worstLot = [...lots].sort((x, y) => x.avg - y.avg)[0]
  if (worstLot && worstLot.net < 0 && lots.length > 1) {
    const symbol = splitSizeKey(worstLot.key).symbol
    out.push({
      tone: "info",
      title: `Avoid ${splitSizeKey(worstLot.key).lots} lots on ${symbol}`,
      figure: money(worstLot.net, true),
      detail: `That size ${result(worstLot.net)} in ${plural(worstLot.trades, "trade")}. The chart shows each size on ${symbol}.`,
      viz: bars(
        a.byLots.filter((g) => splitSizeKey(g.key).symbol === symbol),
        (g) => g.key === worstLot.key,
        (k) => splitSizeKey(k).lots
      ),
    })
  }

  // A clear best: a winning size that beat at least one other size with enough trades.
  for (const { symbol, best: top, sizes } of a.bestLots) {
    if (!top || sizes < 2) continue
    out.push({
      tone: "good",
      title: `Trade ${top.key} lots on ${symbol}`,
      figure: money(top.net, true),
      detail: `That size ${result(top.net)}. ${won(top)}`,
      viz: bars(
        a.byLots.filter((g) => splitSizeKey(g.key).symbol === symbol),
        (g) => splitSizeKey(g.key).lots === top.key,
        (k) => splitSizeKey(k).lots
      ),
    })
  }

  return out
}
