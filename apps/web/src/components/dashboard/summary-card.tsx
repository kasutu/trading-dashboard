import type * as React from "react"
import { EquityChart } from "@/components/charts/equity-chart"
import type { Analytics } from "@/lib/api/types"
import { duration, formatDay, formatPeriod, money, pct, plural, pnlClass } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Net P&L, the equity curve and the key ratios in one card. */
export function SummaryCard({ a, tz }: { a: Analytics; tz: string }) {
  const s = a.summary
  const days = [...a.daily].sort((x, y) => y.net - x.net)
  const bestDay = days[0]
  const worstDay = days.at(-1)!

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(240px,300px)_1fr] lg:p-6">
        <div className="flex flex-col">
          <p className="text-sm text-muted-foreground">Net P&L</p>
          <p className={cn("mt-1 font-display text-5xl font-extrabold tracking-tight", pnlClass(s.net))}>
            {money(s.net, true)}
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            {plural(s.trades, "trade")} on {plural(s.days, "day")}
          </p>
          <p className="text-sm text-muted-foreground">{formatPeriod(a.period)}</p>
          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 text-sm lg:mt-auto">
            <Stat label={`Best day · ${formatDay(bestDay.key)}`} value={money(bestDay.net, true)} />
            <Stat label={`Worst day · ${formatDay(worstDay.key)}`} value={money(worstDay.net, true)} />
            <Stat label="Best trade" value={money(s.bestTrade, true)} />
            <Stat label="Worst trade" value={money(s.worstTrade, true)} />
          </dl>
        </div>
        <EquityChart data={a.curve} tz={tz} />
      </div>

      <dl className="grid grid-cols-2 border-t sm:grid-cols-3 lg:grid-cols-5 [&>div]:border-b [&>div]:border-r [&>div]:-mb-px [&>div]:-mr-px">
        <Kpi label="Win rate" value={pct(s.winRate, 1)} sub={`${s.wins} won · ${s.losses} lost`} />
        <Kpi
          label="Profit factor"
          value={s.profitFactor === null ? "∞" : s.profitFactor.toFixed(2)}
          tone={(s.profitFactor ?? Infinity) >= 1 ? "text-profit" : "text-loss"}
          sub={`${money(s.grossWin)} won · ${money(Math.abs(s.grossLoss))} lost`}
        />
        <Kpi
          label="Avg win / avg loss"
          value={
            <>
              <span className="text-profit">{money(s.avgWin)}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="text-loss">{money(Math.abs(s.avgLoss))}</span>
            </>
          }
          sub={`${money(s.avg, true)} per trade`}
        />
        <Kpi
          label="Max drawdown"
          value={money(s.maxDd)}
          tone={s.maxDd < 0 ? "text-loss" : undefined}
          sub={`Longest losing run: ${plural(s.maxLossStreak, "trade")}`}
        />
        <Kpi label="Trades a day" value={s.tradesPerDay.toFixed(1)} sub={`Median hold: ${duration(s.medianDurationMin)}`} />
      </dl>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub: string; tone?: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 font-mono text-lg font-medium whitespace-nowrap tabular-nums", tone)}>{value}</dd>
      <dd className="mt-0.5 text-xs text-muted-foreground">{sub}</dd>
    </div>
  )
}
