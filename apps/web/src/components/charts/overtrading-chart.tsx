import * as React from "react"
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { usePhone } from "@/hooks/use-media"
import type { OvertradeDay } from "@/lib/api/types"
import { duration, formatDay, money, pnlClass } from "@/lib/format"
import { axisTick } from "./chart-config"
import { ChartTip } from "./chart-tip"

const config = {
  trades: { label: "Trades taken", color: "var(--foreground)" },
  allowed: { label: "Trades your best holding time allows", color: "var(--muted-foreground)" },
  over: { label: "Over", color: "var(--loss)" },
}

/** A day plus the band between the allowance and the trades taken, which is empty unless the day was over. */
type Row = OvertradeDay & { overBand: [number, number] | null }

type Props = { days: OvertradeDay[]; onPick?: (day: string) => void; height?: number }

/** Per day, as smooth areas: the trades your best holding time allows are a soft grey area, the trades taken a line over
 *  it, and where the line rises above the allowance the gap is filled red (no dots: the band shows it). Clicking a
 *  day calls `onPick`. */
export function OvertradingChart({ days, onPick, height = 280 }: Props) {
  const phone = usePhone()
  const id = React.useId().replace(/:/g, "")
  const rows = React.useMemo<Row[]>(
    () => days.map((d) => ({ ...d, overBand: d.allowed !== null ? [Math.min(d.allowed, d.trades), d.trades] : null })),
    [days]
  )
  return (
    <div className="space-y-3">
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height: phone ? Math.min(height, 220) : height }}>
        <ComposedChart
          data={rows}
          margin={{ left: 4, right: 12, top: 12 }}
          onClick={(e) => {
            const i = Number(e?.activeTooltipIndex)
            if (onPick && Number.isInteger(i) && days[i]) onPick(days[i].day)
          }}
          className={onPick ? "cursor-pointer" : undefined}
        >
          <defs>
            <linearGradient id={`${id}-allowed`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-allowed)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-allowed)" stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id={`${id}-trades`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-trades)" stopOpacity={0.1} />
              <stop offset="100%" stopColor="var(--color-trades)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="2 4" strokeOpacity={0.5} />
          <XAxis dataKey="day" tickFormatter={(d) => formatDay(d)} tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={phone ? 32 : 24} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={28} tickCount={4} />
          <ChartTooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.3 }}
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
          {/* The allowance: a soft area, the room your best holding time leaves each day. */}
          <Area
            dataKey="allowed"
            type="monotone"
            stroke="var(--color-allowed)"
            strokeOpacity={0.6}
            strokeWidth={1.5}
            fill={`url(#${id}-allowed)`}
            activeDot={false}
            isAnimationActive={false}
          />
          {/* Trades taken above the allowance: the red band between the two curves. */}
          <Area
            dataKey="overBand"
            type="monotone"
            stroke="none"
            fill="var(--color-over)"
            fillOpacity={0.28}
            activeDot={false}
            isAnimationActive={false}
          />
          {/* Trades taken: a faint fill under the line. */}
          <Area
            dataKey="trades"
            type="monotone"
            stroke="none"
            fill={`url(#${id}-trades)`}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="trades"
            type="monotone"
            stroke="var(--color-trades)"
            strokeWidth={2}
            strokeLinecap="round"
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, fill: "var(--foreground)", stroke: "var(--card)", strokeWidth: 2 }}
          />
        </ComposedChart>
      </ChartContainer>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded bg-foreground" />Trades taken</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-4 rounded-sm bg-muted-foreground/25" />Allowed by your best holding time</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-4 rounded-sm bg-loss/30" />Over</li>
        {onPick && <li className="sm:ml-auto">Tap a day to see its timeline.</li>}
      </ul>
    </div>
  )
}
