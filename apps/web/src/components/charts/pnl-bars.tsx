import type * as React from "react"
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { usePhone } from "@/hooks/use-media"
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
  /** Bars to emphasize; the others are drawn light. Default: the highest and the lowest bar. */
  highlight?: (d: T) => boolean
  /** Height from sm. Phones get a shorter chart. */
  height?: number
  vertical?: boolean
  /** Grow to fill the parent height. `height` becomes the minimum. */
  fill?: boolean
}

/** Bars colored by sign: green above zero, red below. The bars that matter are solid, the rest light, so the chart
 *  supports the card's headline number instead of competing with it. */
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
  const phone = usePhone()
  const h = phone && !vertical ? Math.min(height, 200) : height
  const vals = data.map((d) => d[valueKey] as number)
  const hi = Math.max(...vals)
  const lo = Math.min(...vals)
  const strong = highlight ?? ((d: T) => d[valueKey] === hi || d[valueKey] === lo)
  const category = { dataKey: "key", tickFormatter: xFormat, tick: axisTick, tickLine: false, axisLine: false }
  const value = { tickFormatter: compactMoney, tick: axisTick, tickLine: false, axisLine: false, tickCount: 4 }
  return (
    <ChartContainer
      config={chartConfig}
      className={cn("aspect-auto w-full", fill && "h-full flex-1")}
      style={fill ? { minHeight: h } : { height: h }}
    >
      <BarChart data={data} layout={vertical ? "vertical" : "horizontal"} margin={{ left: 0, right: phone ? 4 : 12, top: 8 }}>
        <CartesianGrid vertical={vertical} horizontal={!vertical} strokeDasharray="2 4" strokeOpacity={0.6} />
        {vertical ? (
          <>
            <XAxis type="number" {...value} />
            <YAxis type="category" {...category} width={104} />
          </>
        ) : (
          <>
            <XAxis {...category} interval="preserveStartEnd" minTickGap={phone ? 20 : 16} />
            <YAxis {...value} width={40} />
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
        {/* No grow-in animation: Recharts animates in JavaScript, frame by frame, which stalls phones. */}
        <Bar dataKey={valueKey} radius={3} maxBarSize={vertical ? 20 : 32} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d[valueKey] >= 0 ? "var(--profit)" : "var(--loss)"}
              fillOpacity={strong(d) ? 0.95 : 0.35}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
