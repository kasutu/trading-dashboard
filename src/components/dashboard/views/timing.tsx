import * as React from "react"
import { Heatmap } from "@/components/charts/heatmap"
import { PnlBars } from "@/components/charts/pnl-bars"
import { Panel } from "@/components/dashboard/panel"
import { hourLabel, hourShort } from "@/lib/format"
import { WEEKDAYS, byDuration, byHour, byWeekday, heatmap, type LocalTrade } from "@/lib/trades"

export function Timing({ ts }: { ts: LocalTrade[] }) {
  const hours = React.useMemo(() => byHour(ts), [ts])
  const weekdays = React.useMemo(() => byWeekday(ts), [ts])
  const grid = React.useMemo(() => heatmap(ts), [ts])
  const holds = React.useMemo(() => byDuration(ts), [ts])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="P&L by hour" description="Hour the trade was opened" className="lg:col-span-2">
        <PnlBars data={hours} xFormat={hourShort} title={(d) => hourLabel(d.key)} height={260} />
      </Panel>
      <Panel title="Weekday and hour" description="Each cell is one hour of one weekday" className="lg:col-span-2">
        <Heatmap cells={grid} weekdays={WEEKDAYS} />
      </Panel>
      <Panel title="P&L by weekday"><PnlBars data={weekdays} /></Panel>
      <Panel title="P&L by holding time" description="Time from open to close"><PnlBars data={holds} /></Panel>
    </div>
  )
}
