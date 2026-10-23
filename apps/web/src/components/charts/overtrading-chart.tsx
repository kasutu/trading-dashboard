import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { usePhone } from "@/hooks/use-media"
import type { OvertradeDay } from "@/lib/api/types"
import { duration, formatDay, money, pnlClass } from "@/lib/format"
import { axisTick } from "./chart-config"
import { ChartTip } from "./chart-tip"

const config = {
  trades: { label: "Trades taken", color: "var(--chart-1)" },
  allowed: { label: "Allowed by your best holding time", color: "var(--profit)" },
} satisfies ChartConfig

type Props = { days: OvertradeDay[]; onPick?: (day: string) => void; height?: number }

/** Per day, as two gradient areas (shadcn's gradient area chart): the trades taken, and over them in green the trades
 *  your best holding time allows. Where the taken area rises above the green one, that day was over. The areas are
 *  not stacked: each shows its own count. Clicking a day calls `onPick`. */
export function OvertradingChart({ days, onPick, height = 280 }: Props) {
  const phone = usePhone()
  const id = React.useId().replace(/:/g, "")
  return (
    <div className="space-y-3">
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: phone ? Math.min(height, 220) : height }}>
        <AreaChart
          accessibilityLayer
          data={days}
          margin={{ left: 12, right: 12, top: 12 }}
          onClick={(e) => {
            const i = Number(e?.activeTooltipIndex)
            if (onPick && Number.isInteger(i) && days[i]) onPick(days[i].day)
          }}
          className={onPick ? "cursor-pointer" : undefined}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(d) => formatDay(d)}
            tick={axisTick}
            interval="preserveStartEnd"
            minTickGap={phone ? 32 : 24}
          />
          {/* Hidden, from 0: natural curves swing between points and must not dip below zero trades. */}
          <YAxis hide domain={[0, (max: number) => Math.ceil(max * 1.1)]} allowDataOverflow />
          <ChartTooltip
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as OvertradeDay
              return (
                <ChartTip
                  title={<>{formatDay(d.day, true)}{d.over && <span className="ml-2 text-loss">Over</span>}</>}
                  rows={[
                    ["Trades taken", d.trades, d.over ? "text-loss" : undefined],
                    ["Allowed", d.allowed ?? "—"],
                    ["In the market", duration(d.spanMin)],
                    ["Net P&L", money(d.net, true), pnlClass(d.net)],
                  ]}
                />
              )
            }}
          />
          <defs>
            <linearGradient id={`${id}-trades`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-trades)" stopOpacity={0.8} />
              <stop offset="95%" stopColor="var(--color-trades)" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id={`${id}-allowed`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-allowed)" stopOpacity={0.8} />
              <stop offset="95%" stopColor="var(--color-allowed)" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <Area
            dataKey="trades"
            type="natural"
            fill={`url(#${id}-trades)`}
            fillOpacity={0.4}
            stroke="var(--color-trades)"
            isAnimationActive={false}
          />
          <Area
            dataKey="allowed"
            type="natural"
            fill={`url(#${id}-allowed)`}
            fillOpacity={0.4}
            stroke="var(--color-allowed)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-4 rounded-sm bg-chart-1 opacity-40" />Trades taken</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-4 rounded-sm bg-profit opacity-50" />Allowed by your best holding time</li>
        {onPick && <li className="sm:ml-auto">Tap a day to see its timeline.</li>}
      </ul>
    </div>
  )
}
