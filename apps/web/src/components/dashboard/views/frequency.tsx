import * as React from "react"
import { DayTimelineDialog } from "@/components/charts/day-timeline-dialog"
import { OvertradingChart } from "@/components/charts/overtrading-chart"
import { PnlBars } from "@/components/charts/pnl-bars"
import { bestMetric } from "@/components/dashboard/metrics"
import { Panel } from "@/components/dashboard/panel"
import { duration, money, ordinal, plural, pnlClass } from "@/lib/format"
import type { Filters, FullAnalytics, Overtrading as OvertradingData } from "@/lib/api/types"
import { best, cn } from "@/lib/utils"

const nth = (key: string) => `${ordinal(parseInt(key))}${key.endsWith("+") ? " and later" : ""} trade of the day`

export function Frequency({ a, accountId, filters }: { a: FullAnalytics; accountId: string; filters: Filters }) {
  const caps = a.capSim
  const top = best(caps)!
  const actual = a.summary.net

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Overtrading o={a.overtrading} accountId={accountId} filters={filters} />
      <Panel
        title="Daily trade cap"
        metric={{
          value: money(top.net, true),
          tone: top.net,
          label: `Best cap: stop after ${plural(top.cap, "trade")} a day`,
          stats: [["Actual", money(actual, true)], ["Change", money(top.net - actual, true)]],
        }}
        description="Net P&L if you stop after N trades each day."
        className="lg:col-span-2"
      >
        <PnlBars
          data={caps}
          highlight={(d) => d.cap === top.cap}
          title={(d) => `Stop after ${plural(d.cap, "trade")}`}
          rows={(d) => [
            ["Net P&L", money(d.net, true), pnlClass(d.net)],
            ["Change", money(d.net - actual, true), pnlClass(d.net - actual)],
            ["Trades kept", d.trades],
          ]}
          height={260}
        />
      </Panel>
      <Panel title="Result by trade number" metric={bestMetric(a.nthTrade, "", nth)} description="1st, 2nd, 3rd trade of the day and later.">
        <PnlBars data={a.nthTrade} title={(d) => nth(d.key)} />
      </Panel>
      <Panel
        title="Busy days and quiet days"
        metric={bestMetric(a.dayBuckets, "", (k) => `${k} trades a day, average per day`, (d) => d.avgPerDay)}
        description="Average daily P&L by the number of trades that day."
      >
        <PnlBars
          data={a.dayBuckets}
          valueKey="avgPerDay"
          title={(d) => `${d.key} trades a day`}
          rows={(d) => [
            ["Average per day", money(d.avgPerDay, true), pnlClass(d.avgPerDay)],
            ["Total", money(d.net, true), pnlClass(d.net)],
            ["Days", d.days],
            ["Green days", `${d.greenDays} of ${d.days}`],
          ]}
        />
      </Panel>
    </div>
  )
}

/** Trades taken each day against the trades that fit at the best holding time. Click a day for its timeline. */
function Overtrading({ o, accountId, filters }: { o: OvertradingData; accountId: string; filters: Filters }) {
  const [day, setDay] = React.useState<string | null>(null)
  const picked = o.days.find((d) => d.day === day)
  if (!o.best)
    return (
      <Panel title="Overtrading" description="Trades taken each day against the trades your best holding time allows." className="lg:col-span-2">
        <p className="rounded-lg bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
          No holding time made money over 5 or more trades yet, so there is no limit to compare against.
        </p>
      </Panel>
    )
  const days = o.over.trades + o.within.trades
  return (
    <Panel
      title="Overtrading"
      metric={{
        value: plural(o.over.trades, "day"),
        tone: o.over.trades ? "loss" : "profit",
        label: `Over your limit, of ${plural(days, "trading day")}`,
        stats: [
          ["Net on days over", o.over.trades ? `${money(o.over.net, true)} (${money(o.over.avg, true)} a day)` : "No days"],
          ["Net on other days", o.within.trades ? `${money(o.within.net, true)} (${money(o.within.avg, true)} a day)` : "No days"],
        ],
      }}
      description={
        <>
          Your best holding time is {o.best.key} (median {duration(o.best.medianMin)}), {money(o.best.net, true)} over{" "}
          {plural(o.best.trades, "trade")}. A day is over when you took more trades than that holding time fits in the time you were in the market.
        </>
      }
      className="lg:col-span-2"
    >
      <OvertradingChart days={o.days} onPick={setDay} />
      <DayTimelineDialog accountId={accountId} filters={filters} day={day} onClose={() => setDay(null)}>
        {picked && (
          <p className={cn("rounded-lg px-3 py-2 text-sm", picked.over ? "bg-loss/10 text-loss" : "bg-muted/60 text-muted-foreground")}>
            {plural(picked.trades, "trade")} taken. {picked.allowed === null ? "" : `Your best holding time fits ${picked.allowed} in ${duration(picked.spanMin)} in the market.`}
          </p>
        )}
      </DayTimelineDialog>
    </Panel>
  )
}
