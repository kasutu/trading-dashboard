import type * as React from "react"
import { cn } from "@/lib/utils"
import type { TipRow } from "./chart-config"

export function ChartTip({ title, rows }: { title: React.ReactNode; rows: TipRow[] }) {
  return (
    <div className="grid min-w-44 gap-1.5 rounded-lg border bg-popover px-3 py-2.5 text-xs shadow-lg">
      <div className="font-medium">{title}</div>
      {rows.map(([l, v, c]) => (
        <div key={l} className="flex justify-between gap-4">
          <span className="text-muted-foreground">{l}</span>
          <span className={cn("font-mono font-medium tabular-nums", c)}>{v}</span>
        </div>
      ))}
    </div>
  )
}
