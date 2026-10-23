import * as React from "react"
import { TradeCalendar } from "@/components/calendar/trade-calendar"
import { PnlBars } from "@/components/charts/pnl-bars"
import { BreakdownTable } from "@/components/dashboard/breakdown-table"
import { pillGroup, pillItem } from "@/components/dashboard/filter-bar"
import { bestMetric } from "@/components/dashboard/metrics"
import { Panel } from "@/components/dashboard/panel"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Analytics, Filters } from "@/lib/api/types"
import { formatDay, formatMonth, money, plural } from "@/lib/format"

export function Overview({ a, accountId, filters }: { a: Analytics; accountId: string; filters: Filters }) {
  const green = a.daily.filter((d) => d.net > 0).length

  return (
    <div className="grid grid-cols-1 gap-4">
      <Panel title="Daily P&L" share={false} description={`${plural(green, "green day")}, ${plural(a.daily.length - green, "red day")}`}>
        <TradeCalendar accountId={accountId} filters={filters} period={a.period} />
      </Panel>
      <PeriodPnl a={a} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
        <Panel title="By symbol" metric={bestMetric(a.bySymbol, "symbol")}><BreakdownTable label="Symbol" rows={a.bySymbol} /></Panel>
        <Panel title="By side" metric={bestMetric(a.bySide, "side")}><BreakdownTable label="Side" rows={a.bySide} /></Panel>
      </div>
    </div>
  )
}

type Period = "week" | "month"

/** Net P&L per week or per month, with a toggle between the two. The latest one is the headline. */
function PeriodPnl({ a }: { a: Analytics }) {
  const [period, setPeriod] = React.useState<Period>("week")
  const weekly = period === "week"
  const rows = weekly ? a.byWeek : a.byMonth
  const green = rows.filter((g) => g.net > 0).length
  const unit = weekly ? "week" : "month"
  const last = rows.at(-1)
  const name = (k: string) => (weekly ? `Week of ${formatDay(k)}` : formatMonth(k, true))
  const top = rows.reduce<(typeof rows)[number] | undefined>((b, c) => (!b || c.net > b.net ? c : b), undefined)

  return (
    <Panel
      title={weekly ? "Weekly P&L" : "Monthly P&L"}
      metric={
        last && {
          value: money(last.net, true),
          tone: last.net,
          label: `Latest ${unit} · ${name(last.key)}`,
          stats: [
            [`Green ${unit}s`, `${green} of ${rows.length}`],
            ...(top && top !== last ? [[`Best · ${name(top.key)}`, money(top.net, true)] as [string, string]] : []),
          ],
        }
      }
      action={
        <ToggleGroup
          type="single"
          size="sm"
          spacing={1}
          className={pillGroup}
          value={period}
          onValueChange={(v) => v && setPeriod(v as Period)}
          aria-label="Group by"
        >
          <ToggleGroupItem value="week" className={pillItem}>Weekly</ToggleGroupItem>
          <ToggleGroupItem value="month" className={pillItem}>Monthly</ToggleGroupItem>
        </ToggleGroup>
      }
    >
      <PnlBars
        data={rows}
        xFormat={weekly ? (k) => formatDay(k) : (k) => formatMonth(k)}
        title={(d) => (weekly ? `Week of ${formatDay(d.key)}` : formatMonth(d.key, true))}
        highlight={(d) => d.key === last?.key}
        height={220}
      />
    </Panel>
  )
}
