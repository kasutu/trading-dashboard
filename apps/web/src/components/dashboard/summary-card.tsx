import * as React from "react"
import { EquityChart } from "@/components/charts/equity-chart"
import type { Analytics } from "@/lib/api/types"
import { duration, formatDay, formatPeriod, money, pct, plural } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MetricBlock, Stats } from "./panel"

/** Net P&L, the equity curve and the key ratios in one card. Net P&L is the one number that stands out;
 *  every other figure is a quiet label and value. */
export const SummaryCard = React.memo(function SummaryCard({ a, tz, className }: { a: Analytics; tz: string; className?: string }) {
  const s = a.summary
  const days = [...a.daily].sort((x, y) => y.net - x.net)
  const bestDay = days[0]
  const worstDay = days.at(-1)!

  return (
    <section className={cn("@container min-w-0 rounded-xl border bg-card p-5 shadow-card lg:p-6", className)}>
      <div className="grid grid-cols-1 gap-6 @2xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold">Net P&L</h2>
          <MetricBlock
            size="lg"
            className="mt-1"
            metric={{ value: money(s.net, true), tone: s.net, label: `${plural(s.trades, "trade")} on ${plural(s.days, "day")}, ${formatPeriod(a.period)}` }}
          />
          <Stats
            className="mt-6 sm:grid sm:gap-x-4 @2xl:mt-auto"
            items={[
              [`Best day: ${formatDay(bestDay.key)}`, money(bestDay.net, true)],
              [`Worst day: ${formatDay(worstDay.key)}`, money(worstDay.net, true)],
              ["Best trade", money(s.bestTrade, true)],
              ["Worst trade", money(s.worstTrade, true)],
            ]}
          />
        </div>
        <EquityChart data={a.curve} tz={tz} />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t pt-5 @lg:grid-cols-3 @4xl:grid-cols-5">
        <Kpi label="Win rate" value={pct(s.winRate, 1)} sub={`${s.wins} won, ${s.losses} lost`} />
        <Kpi
          label="Profit factor"
          value={s.profitFactor === null ? "∞" : s.profitFactor.toFixed(2)}
          sub={`${money(s.grossWin)} won, ${money(Math.abs(s.grossLoss))} lost`}
        />
        <Kpi label="Average win / loss" value={`${money(s.avgWin)} / ${money(Math.abs(s.avgLoss))}`} sub={`${money(s.avg, true)} per trade`} />
        <Kpi label="Max drawdown" value={money(s.maxDd)} sub={`Longest losing run: ${plural(s.maxLossStreak, "trade")}`} />
        <Kpi label="Trades a day" value={s.tradesPerDay.toFixed(1)} sub={`Median hold: ${duration(s.medianDurationMin)}`} />
      </dl>
    </section>
  )
})

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-base tabular-nums">{value}</dd>
      <dd className="mt-0.5 text-xs text-muted-foreground">{sub}</dd>
    </div>
  )
}
