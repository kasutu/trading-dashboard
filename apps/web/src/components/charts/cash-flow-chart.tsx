import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import type { CashDay, LocalCashFlow } from "@/lib/api/types"
import { compactMoney, formatDay, formatLongDay, money } from "@/lib/format"
import { axisTick, chartConfig } from "./chart-config"

const DAY = 86_400_000
const toTime = (day: string) => Date.parse(`${day}T00:00:00Z`)
const toDay = (t: number) => new Date(t).toISOString().slice(0, 10)

/** `tail` extends the step line to the right edge; it has no bars and no tooltip. */
type Point = CashDay & { t: number; out: number; tail?: boolean }

const LEGEND = [
  ["Deposits", "var(--deposit)", "bar"],
  ["Withdrawals", "var(--withdrawal)", "bar"],
  ["Net deposited", "var(--chart-1)", "line"],
] as const

/** Deposits up and withdrawals down on a time axis, with the running net deposited as a step line. */
export function CashFlowChart({ daily, rows }: { daily: CashDay[]; rows: LocalCashFlow[] }) {
  const points: Point[] = daily.map((d) => ({ ...d, t: toTime(d.day), out: -d.withdrawals }))
  const first = points[0].t
  const last = points.at(-1)!.t
  const pad = Math.max((last - first) * 0.04, 2 * DAY)
  const end = points.at(-1)!
  const data: Point[] = [...points, { ...end, t: last + pad, deposits: 0, withdrawals: 0, out: 0, net: 0, tail: true }]

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {LEGEND.map(([label, color, mark]) => (
          <li key={label} className="flex items-center gap-1.5">
            <span
              className={mark === "bar" ? "size-2.5 rounded-[3px]" : "h-0.5 w-3.5 rounded-full"}
              style={{ background: color }}
            />
            {label}
          </li>
        ))}
      </ul>
      <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full sm:h-[260px]">
        <ComposedChart data={data} stackOffset="sign" margin={{ left: 4, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="2 4" strokeOpacity={0.6} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[first - pad, last + pad]}
            tickFormatter={(t: number) => formatDay(toDay(t))}
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis tickFormatter={compactMoney} tick={axisTick} tickLine={false} axisLine={false} width={40} tickCount={4} />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
          <ChartTooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as Point
              if (d.tail) return null
              return <DayTip day={d} flows={rows.filter((r) => r.day === d.day)} />
            }}
          />
          <Bar dataKey="deposits" stackId="flow" fill="var(--deposit)" barSize={10} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="out" stackId="flow" fill="var(--withdrawal)" barSize={10} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Line
            dataKey="cumulative"
            type="stepAfter"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

/** Every entry of the day, oldest first, then the running total. */
function DayTip({ day, flows }: { day: CashDay; flows: LocalCashFlow[] }) {
  return (
    <div className="grid max-w-72 min-w-48 gap-1.5 rounded-lg border bg-popover px-3 py-2.5 text-xs shadow-lg">
      <div className="font-medium">{formatLongDay(day.day)}</div>
      {[...flows].reverse().map((f) => (
        <div key={f.id}>
          <div className="flex justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-[2px]" style={{ background: `var(--${f.kind})` }} />
              {f.kind === "deposit" ? "Deposit" : "Withdrawal"}
            </span>
            <span className="font-mono font-medium tabular-nums">{f.kind === "deposit" ? "+" : "−"}{money(f.amount)}</span>
          </div>
          {f.note && <p className="truncate pl-3.5 text-muted-foreground">{f.note}</p>}
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t pt-1.5">
        <span className="text-muted-foreground">Net deposited</span>
        <span className="font-mono font-medium tabular-nums">{money(day.cumulative)}</span>
      </div>
    </div>
  )
}
