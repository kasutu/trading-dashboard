import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import type { OvertradeDay } from "@/lib/api/types"
import { duration, formatDay, money, pnlClass } from "@/lib/format"
import { axisTick } from "./chart-config"
import { ChartTip } from "./chart-tip"

const config = {
  trades: { label: "Trades taken", color: "var(--foreground)" },
  allowed: { label: "Trades your best holding time allows", color: "var(--muted-foreground)" },
}

type Props = { days: OvertradeDay[]; onPick?: (day: string) => void; height?: number }

/** Per day: trades taken (solid) against trades the best holding time allows (dashed). Days over the line get a red dot.
 *  Clicking a day calls `onPick`. */
export function OvertradingChart({ days, onPick, height = 280 }: Props) {
  return (
    <div className="space-y-3">
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <LineChart
          data={days}
          margin={{ left: 4, right: 12, top: 12 }}
          onClick={(e) => {
            const i = Number(e?.activeTooltipIndex)
            if (onPick && Number.isInteger(i) && days[i]) onPick(days[i].day)
          }}
          className={onPick ? "cursor-pointer" : undefined}
        >
          <CartesianGrid vertical={false} strokeDasharray="2 4" />
          <XAxis dataKey="day" tickFormatter={(d) => formatDay(d)} tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis allowDecimals={false} tick={axisTick} tickLine={false} axisLine={false} width={32} />
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
          <Line
            dataKey="allowed"
            type="linear"
            stroke="var(--color-allowed)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="trades"
            type="linear"
            stroke="var(--color-trades)"
            strokeWidth={2}
            isAnimationActive={false}
            dot={(p: { cx?: number; cy?: number; index?: number; payload?: OvertradeDay }) =>
              p.payload?.over && p.cx != null && p.cy != null ? (
                <circle key={p.index} cx={p.cx} cy={p.cy} r={4.5} fill="var(--loss)" stroke="var(--card)" strokeWidth={2} />
              ) : (
                <g key={p.index} />
              )
            }
            activeDot={{ r: 4, fill: "var(--foreground)", stroke: "var(--card)", strokeWidth: 2 }}
          />
        </LineChart>
      </ChartContainer>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded bg-foreground" />Trades taken</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="w-4 border-t-[1.5px] border-dashed border-muted-foreground" />Allowed by your best holding time</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full bg-loss" />Over</li>
        {onPick && <li className="sm:ml-auto">Click a day to see its timeline.</li>}
      </ul>
    </div>
  )
}
