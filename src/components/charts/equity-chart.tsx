import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { compactMoney, money, pnlClass } from "@/lib/format"
import type { EquityPoint } from "@/lib/trades"
import { axisTick, chartConfig } from "./chart-config"
import { ChartTip } from "./chart-tip"

/** Cumulative net P&L, one point per closed trade. */
export function EquityChart({ data, tz }: { data: EquityPoint[]; tz: string }) {
  const color = (data.at(-1)?.equity ?? 0) >= 0 ? "var(--profit)" : "var(--loss)"
  const values = data.map((p) => p.equity)
  const high = Math.max(...values)
  const low = Math.min(...values)
  const extreme = (y: number, label: string) => {
    const tone = y >= 0 ? "var(--profit)" : "var(--loss)"
    return (
      <ReferenceLine
        y={y}
        stroke={tone}
        strokeOpacity={0.7}
        strokeDasharray="4 4"
        label={(p: { viewBox?: { x?: number; y?: number; width?: number } }) => (
          <PriceTag x={(p.viewBox?.x ?? 0) + (p.viewBox?.width ?? 0)} y={p.viewBox?.y ?? 0} text={`${label} ${money(y, true)}`} fill={tone} />
        )}
      />
    )
  }
  const date = (t: number) => new Date(t).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" })
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-full min-h-[260px] w-full flex-1">
      <AreaChart data={data} margin={{ left: 4, right: 4, top: 12, bottom: 8 }}>
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
        {high !== low && extreme(high, "High")}
        {high !== low && extreme(low, "Low")}
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

/** A filled tag on a price line, right-aligned to the plot edge. */
function PriceTag({ x, y, text, fill }: { x: number; y: number; text: string; fill: string }) {
  const w = text.length * 6.4 + 12 // ponytail: width estimated for an 11px mono font
  return (
    <g>
      <rect x={x - w} y={y - 9} width={w} height={18} rx={4} fill={fill} />
      <text x={x - w / 2} y={y + 4} textAnchor="middle" fontSize={11} fontFamily="var(--font-mono)" fontWeight={500} fill="var(--card)">
        {text}
      </text>
    </g>
  )
}
