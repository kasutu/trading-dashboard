import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { compactMoney, formatDay, money, pnlClass } from "@/lib/format"
import { axisTick, chartConfig } from "./chart-config"
import { ChartTip } from "./chart-tip"

type Point = { key: string; actual: number; rules: number }

/** Cumulative daily net P&L: what happened vs. with the limits. A line marks where your recent days start. */
export function CompareChart({ data, splitDay }: { data: Point[]; splitDay: string }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full sm:h-[280px]">
      <LineChart data={data} margin={{ left: 4, right: 12, top: 20 }}>
        <CartesianGrid vertical={false} strokeDasharray="2 4" strokeOpacity={0.6} />
        <XAxis dataKey="key" tickFormatter={(d) => formatDay(d)} tick={axisTick} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={compactMoney} tick={axisTick} tickLine={false} axisLine={false} width={40} tickCount={4} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
        <ReferenceLine
          x={splitDay}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={{ value: "Recent days", position: "insideTopLeft", fontSize: 11, fill: "var(--muted-foreground)", dy: -16 }}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload as Point
            return (
              <ChartTip
                title={formatDay(d.key, true)}
                rows={[
                  ["With limits", money(d.rules, true), pnlClass(d.rules)],
                  ["Actual", money(d.actual, true), pnlClass(d.actual)],
                ]}
              />
            )
          }}
        />
        <Line dataKey="actual" stroke="var(--muted-foreground)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Line dataKey="rules" stroke="var(--brand)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  )
}
