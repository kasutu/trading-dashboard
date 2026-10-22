import * as React from "react"
import { DayTimelineDialog } from "@/components/charts/day-timeline-dialog"
import { OvertradingChart } from "@/components/charts/overtrading-chart"
import { PnlBars } from "@/components/charts/pnl-bars"
import { Panel } from "@/components/dashboard/panel"
import { duration, money, ordinal, plural, pnlClass } from "@/lib/format"
import type { Filters, FullAnalytics, Group, Overtrading as OvertradingData } from "@/lib/api/types"
import { best, cn } from "@/lib/utils"

export function Frequency({ a, accountId, filters }: { a: FullAnalytics; accountId: string; filters: Filters }) {
  const caps = a.capSim
  const top = best(caps)!
  const actual = a.summary.net

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Overtrading o={a.overtrading} accountId={accountId} filters={filters} />
      <Panel
        title="Daily trade cap"
        description={
          <>
            Net P&L if you stop after N trades each day. Best cap: {plural(top.cap, "trade")},{" "}
            <span className={pnlClass(top.net)}>{money(top.net, true)}</span>. Actual: {money(actual, true)}.
          </>
        }
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
      <Panel title="Result by trade number" description="1st, 2nd, 3rd trade of the day and later">
        <PnlBars data={a.nthTrade} title={(d) => `${ordinal(parseInt(d.key))}${d.key.endsWith("+") ? " and later" : ""} trade of the day`} />
      </Panel>
      <Panel title="Busy days and quiet days" description="Average daily P&L by number of trades that day">
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
  return (
    <Panel
      title="Overtrading"
      description={
        <>
          Your best holding time is {o.best.key} (median {duration(o.best.medianMin)}),{" "}
          <span className={pnlClass(o.best.net)}>{money(o.best.net, true)}</span> over {plural(o.best.trades, "trade")}. A day is over when you took
          more trades than that holding time fits in the time you were in the market.
        </>
      }
      className="lg:col-span-2"
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-2 sm:max-w-md">
          <DayGroup label="Days over" g={o.over} tone="over" />
          <DayGroup label="Other days" g={o.within} />
        </dl>
        <OvertradingChart days={o.days} onPick={setDay} />
      </div>
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

function DayGroup({ label, g, tone }: { label: string; g: Group; tone?: "over" }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {tone && <span aria-hidden className="size-1.5 rounded-full bg-loss" />}
        {label} <span className="font-mono tabular-nums">{g.trades}</span>
      </dt>
      <dd className={cn("mt-1 font-mono text-lg font-medium tabular-nums", pnlClass(g.net))}>{money(g.net, true)}</dd>
      <dd className="text-xs text-muted-foreground">{g.trades ? `${money(g.avg, true)} a day` : "No days"}</dd>
    </div>
  )
}
