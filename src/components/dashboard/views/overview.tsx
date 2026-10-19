import * as React from "react"
import { PnlBars } from "@/components/charts/pnl-bars"
import { BreakdownTable } from "@/components/dashboard/breakdown-table"
import { Panel } from "@/components/dashboard/panel"
import { plural } from "@/lib/format"
import { bySide, bySymbol, daily, formatDay, type LocalTrade } from "@/lib/trades"

export function Overview({ ts }: { ts: LocalTrade[] }) {
  const days = React.useMemo(() => daily(ts), [ts])
  const symbols = React.useMemo(() => bySymbol(ts), [ts])
  const sides = React.useMemo(() => bySide(ts), [ts])
  const green = days.filter((d) => d.net > 0).length

  return (
    <div className="grid gap-4">
      <Panel title="Daily P&L" description={`${plural(green, "green day")}, ${plural(days.length - green, "red day")}`}>
        <PnlBars data={days} height={220} xFormat={(d) => formatDay(d)} title={(d) => formatDay(d.key, true)} />
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <Panel title="By symbol"><BreakdownTable label="Symbol" rows={symbols} /></Panel>
        <Panel title="By side"><BreakdownTable label="Side" rows={sides} /></Panel>
      </div>
    </div>
  )
}
