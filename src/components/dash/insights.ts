import { money, pct, hourLabel } from "@/lib/format"
import type { Group, TTrade } from "@/lib/trades"
import * as A from "@/lib/trades"

export type Insight = { tone: "good" | "bad" | "info"; title: string; detail: string }

const MIN = 5 // ignore buckets with too few trades

export function buildInsights(ts: TTrade[]): Insight[] {
  const out: Insight[] = []
  if (ts.length < 10) return out
  const pick = (gs: Group[], dir: 1 | -1) =>
    gs.filter((g) => g.trades >= MIN).sort((a, b) => dir * (b.net - a.net))[0]

  const hours = A.byHour(ts)
  const bestH = pick(hours, 1)
  const worstH = pick(hours, -1)
  if (worstH && worstH.net < 0)
    out.push({
      tone: "bad",
      title: `Worst hour: ${hourLabel(worstH.key)}`,
      detail: `${money(worstH.net, true)} over ${worstH.trades} trades (${pct(worstH.winRate)} win). Consider not trading this hour.`,
    })
  if (bestH && bestH.net > 0)
    out.push({
      tone: "good",
      title: `Best hour: ${hourLabel(bestH.key)}`,
      detail: `${money(bestH.net, true)} over ${bestH.trades} trades (${pct(bestH.winRate)} win).`,
    })

  const losingHours = hours.filter((h) => h.trades >= 3 && h.net < 0)
  if (losingHours.length) {
    const saved = -losingHours.reduce((s, h) => s + h.net, 0)
    out.push({
      tone: "info",
      title: `Skip ${losingHours.length} losing hours → ${money(saved, true)}`,
      detail: `Hours ${losingHours.map((h) => h.key.padStart(2, "0")).join(", ")} were net negative. Removing them would have improved P&L by that much.`,
    })
  }

  const wd = A.byWeekday(ts)
  const worstD = pick(wd, -1)
  if (worstD && worstD.net < 0)
    out.push({ tone: "bad", title: `Worst day: ${worstD.key}`, detail: `${money(worstD.net, true)} over ${worstD.trades} trades.` })

  const cap = A.tradeCapSim(ts)
  if (cap.length > 1) {
    const actual = ts.reduce((s, t) => s + t.net, 0)
    const best = [...cap].sort((a, b) => b.net - a.net)[0]
    if (best.net > actual + 0.01)
      out.push({
        tone: "good",
        title: `Cap at ${best.cap} trade${best.cap > 1 ? "s" : ""}/day → ${money(best.net, true)}`,
        detail: `vs ${money(actual, true)} actual. Trades after the ${best.cap}${ord(best.cap)} of the day cost you ${money(best.net - actual)}.`,
      })
  }

  const ll = A.lossLimitSim(ts)
  if (ll.length) {
    const actual = ts.reduce((s, t) => s + t.net, 0)
    const best = [...ll].sort((a, b) => b.net - a.net)[0]
    if (best.net > actual + 0.01)
      out.push({
        tone: "good",
        title: `Daily stop at -$${best.limit} → ${money(best.net, true)}`,
        detail: `Stopping for the day after losing $${best.limit} would have triggered on ${best.stoppedDays} days and saved ${money(best.net - actual)}.`,
      })
  }

  const rv = A.revenge(ts)
  if (rv.after.trades >= MIN && rv.after.avg < rv.other.avg)
    out.push({
      tone: "bad",
      title: `Trades right after a loss underperform`,
      detail: `Within ${rv.windowMin} min of a loss: ${pct(rv.after.winRate)} win, ${money(rv.after.avg, true)}/trade (${rv.after.trades} trades) vs ${pct(rv.other.winRate)}, ${money(rv.other.avg, true)} otherwise.`,
    })

  const dur = A.byDuration(ts).filter((g) => g.trades >= MIN)
  const worstDur = [...dur].sort((a, b) => a.net - b.net)[0]
  const bestDur = [...dur].sort((a, b) => b.net - a.net)[0]
  if (worstDur && bestDur && worstDur.net < 0 && bestDur.net > 0)
    out.push({
      tone: "info",
      title: `Holding ${bestDur.key} wins, ${worstDur.key} loses`,
      detail: `${bestDur.key} holds: ${money(bestDur.net, true)} (${bestDur.trades} trades). ${worstDur.key} holds: ${money(worstDur.net, true)} (${worstDur.trades} trades).`,
    })

  const so = A.byReason(ts).find((r) => r.key.startsWith("Stop out"))
  if (so && so.trades)
    out.push({
      tone: "bad",
      title: `${so.trades} margin stop-outs`,
      detail: `${money(so.net, true)} lost to stop-outs. Position size is too big for the account balance at those times.`,
    })

  const lots = A.byLots(ts).filter((g) => g.trades >= MIN)
  const worstLot = [...lots].sort((a, b) => a.avg - b.avg)[0]
  if (worstLot && worstLot.net < 0 && lots.length > 1)
    out.push({
      tone: "info",
      title: `Worst size: ${worstLot.key} lots`,
      detail: `${money(worstLot.net, true)} over ${worstLot.trades} trades, ${money(worstLot.avg, true)} per trade.`,
    })

  return out
}

const ord = (n: number) => (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th")
