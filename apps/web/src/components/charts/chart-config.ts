import type * as React from "react"
import type { ChartConfig } from "@/components/ui/chart"
import { money, pct, pnlClass } from "@/lib/format"

export const chartConfig = {
  net: { label: "Net P&L", color: "var(--chart-1)" },
  equity: { label: "Equity", color: "var(--chart-1)" },
} satisfies ChartConfig

export const axisTick = { fontSize: 11, fontFamily: "var(--font-mono)" }

export type TipRow = [label: string, value: React.ReactNode, className?: string]

/** Default tooltip rows for a Group-like row. */
export function groupRows(d: { net: number; trades?: number; winRate?: number; avg?: number }): TipRow[] {
  const rows: TipRow[] = [["Net P&L", money(d.net, true), pnlClass(d.net)]]
  if (d.trades !== undefined) rows.push(["Trades", d.trades])
  if (d.winRate !== undefined) rows.push(["Win rate", pct(d.winRate)])
  if (d.avg !== undefined) rows.push(["Average per trade", money(d.avg, true), pnlClass(d.avg)])
  return rows
}
