import { TradeCalendar } from "@/components/calendar/trade-calendar"
import { BreakdownTable } from "@/components/dashboard/breakdown-table"
import { Panel } from "@/components/dashboard/panel"
import type { Analytics, Filters } from "@/lib/api/types"
import { plural } from "@/lib/format"

export function Overview({ a, accountId, filters }: { a: Analytics; accountId: string; filters: Filters }) {
  const green = a.daily.filter((d) => d.net > 0).length

  return (
    <div className="grid gap-4">
      <Panel title="Daily P&L" description={`${plural(green, "green day")}, ${plural(a.daily.length - green, "red day")}`}>
        <TradeCalendar accountId={accountId} filters={filters} period={a.period} />
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <Panel title="By symbol"><BreakdownTable label="Symbol" rows={a.bySymbol} /></Panel>
        <Panel title="By side"><BreakdownTable label="Side" rows={a.bySide} /></Panel>
      </div>
    </div>
  )
}
