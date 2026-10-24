import { Heatmap } from "@/components/charts/heatmap"
import { PnlBars } from "@/components/charts/pnl-bars"
import { bestMetric } from "@/components/dashboard/metrics"
import { Panel, type Metric } from "@/components/dashboard/panel"
import type { FullAnalytics, Group } from "@/lib/api/types"
import { WEEKDAYS, hourLabel, hourShort, money, plural } from "@/lib/format"

export function Timing({ a }: { a: FullAnalytics }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="P&L by hour" metric={bestMetric(a.byHour, "hour", hourLabel)} description="By the hour the trade was opened." className="lg:col-span-2">
        <PnlBars data={a.byHour} xFormat={hourShort} title={(d) => hourLabel(d.key)} height={260} />
      </Panel>
      <Panel title="Weekday and hour" metric={slotMetric(a.heatmap)} description="Each cell is one hour of one weekday." className="lg:col-span-2">
        <Heatmap cells={a.heatmap} weekdays={WEEKDAYS} />
      </Panel>
      <Panel title="P&L by weekday" metric={bestMetric(a.byWeekday, "weekday")}><PnlBars data={a.byWeekday} /></Panel>
      <Panel title="P&L by holding time" metric={bestMetric(a.byDuration, "holding time")} description="Time from open to close.">
        <PnlBars data={a.byDuration} />
      </Panel>
    </div>
  )
}

/** The weekday and hour that made the most. */
function slotMetric(cells: Group[][]): Metric | undefined {
  let top: { d: number; h: number; g: Group } | undefined
  cells.forEach((row, d) => row.forEach((g, h) => { if (g.trades && (!top || g.net > top.g.net)) top = { d, h, g } }))
  if (!top) return undefined
  return {
    value: money(top.g.net, true),
    tone: top.g.net,
    label: `Best hour of the week: ${WEEKDAYS[top.d]} ${hourLabel(top.h)}, ${plural(top.g.trades, "trade")}`,
  }
}
