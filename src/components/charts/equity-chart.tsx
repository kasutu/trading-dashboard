import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { compactMoney, money, pnlClass } from "@/lib/format"
import type { EquityPoint } from "@/lib/trades"
import { axisTick, chartConfig } from "./chart-config"
import { ChartTip } from "./chart-tip"

/** Cumulative net P&L, one point per closed trade. */
export function EquityChart({ data, tz }: { data: EquityPoint[]; tz: string }) {
  const color = (data.at(-1)?.equity ?? 0) >= 0 ? "var(--profit)" : "var(--loss)"
  const date = (t: number) => new Date(t).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" })
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-full min-h-[260px] w-full flex-1">
      <AreaChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <defs>
          <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="2 4" />
        <XAxis dataKey="n" tick={axisTick} tickLine={false} axisLine={false} minTickGap={48} tickFormatter={(n) => `#${n}`} />
        <YAxis orientation="right" tickFormatter={compactMoney} tick={axisTick} tickLine={false} axisLine={false} width={44} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
        <ChartTooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload as EquityPoint
            return (
              <ChartTip
                title={`Trade #${d.n} · ${date(d.time)}`}
                rows={[
                  ["Equity", money(d.equity, true), pnlClass(d.equity)],
                  ["This trade", money(d.net, true), pnlClass(d.net)],
                  ["Drawdown", money(d.drawdown), d.drawdown < 0 ? "text-loss" : undefined],
                ]}
              />
            )
          }}
        />
        <Area type="monotone" dataKey="equity" stroke={color} strokeWidth={2} fill="url(#equity-fill)" dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ChartContainer>
  )
}
