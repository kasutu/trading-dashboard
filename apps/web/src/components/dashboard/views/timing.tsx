import { Heatmap } from "@/components/charts/heatmap"
import { PnlBars } from "@/components/charts/pnl-bars"
import { Panel } from "@/components/dashboard/panel"
import type { Analytics } from "@/lib/api/types"
import { WEEKDAYS, hourLabel, hourShort } from "@/lib/format"

export function Timing({ a }: { a: Analytics }) {

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="P&L by hour" description="Hour the trade was opened" className="lg:col-span-2">
        <PnlBars data={a.byHour} xFormat={hourShort} title={(d) => hourLabel(d.key)} height={260} />
      </Panel>
      <Panel title="Weekday and hour" description="Each cell is one hour of one weekday" className="lg:col-span-2">
        <Heatmap cells={a.heatmap} weekdays={WEEKDAYS} />
      </Panel>
      <Panel title="P&L by weekday"><PnlBars data={a.byWeekday} /></Panel>
      <Panel title="P&L by holding time" description="Time from open to close"><PnlBars data={a.byDuration} /></Panel>
    </div>
  )
}
