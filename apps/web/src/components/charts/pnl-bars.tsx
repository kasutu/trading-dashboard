import type * as React from "react"
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { compactMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { axisTick, chartConfig, groupRows, type TipRow } from "./chart-config"
import { ChartTip } from "./chart-tip"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { key: string; net: number; [k: string]: any }

type Props<T extends Row> = {
  data: T[]
  valueKey?: string
  xFormat?: (v: string) => string
  title?: (d: T) => React.ReactNode
  rows?: (d: T) => TipRow[]
  highlight?: (d: T) => boolean
  height?: number
  vertical?: boolean
  /** Grow to fill the parent height. `height` becomes the minimum. */
  fill?: boolean
}

/** Bars colored by sign: green above zero, red below. */
export function PnlBars<T extends Row>({
  data,
  valueKey = "net",
  xFormat,
  title,
  rows = groupRows,
  highlight,
  height = 240,
  vertical = false,
  fill = false,
}: Props<T>) {
  const category = { dataKey: "key", tickFormatter: xFormat, tick: axisTick, tickLine: false, axisLine: false }
  const value = { tickFormatter: compactMoney, tick: axisTick, tickLine: false, axisLine: false }
  return (
    <ChartContainer
      config={chartConfig}
      className={cn("aspect-auto w-full", fill && "h-full flex-1")}
      style={fill ? { minHeight: height } : { height }}
    >
      <BarChart data={data} layout={vertical ? "vertical" : "horizontal"} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={vertical} horizontal={!vertical} strokeDasharray="2 4" />
        {vertical ? (
          <>
            <XAxis type="number" {...value} />
            <YAxis type="category" {...category} width={96} />
          </>
        ) : (
          <>
            <XAxis {...category} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...value} width={44} />
          </>
        )}
        <ReferenceLine {...(vertical ? { x: 0 } : { y: 0 })} stroke="var(--muted-foreground)" strokeOpacity={0.4} ifOverflow="extendDomain" />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.7 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload as T
            return <ChartTip title={title ? title(d) : xFormat ? xFormat(d.key) : d.key} rows={rows(d)} />
          }}
        />
        <Bar dataKey={valueKey} radius={3} maxBarSize={vertical ? 20 : 32}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d[valueKey] >= 0 ? "var(--profit)" : "var(--loss)"}
              fillOpacity={highlight ? (highlight(d) ? 1 : 0.3) : 0.9}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
