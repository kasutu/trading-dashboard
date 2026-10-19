import * as React from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { money, pct, pnlClass } from "@/lib/format"
import { cn } from "@/lib/utils"

const config = {
  net: { label: "Net P&L", color: "var(--chart-1)" },
  equity: { label: "Equity", color: "var(--chart-1)" },
} satisfies ChartConfig

/* ---------- tooltip ---------- */

export type TipRow = [label: string, value: React.ReactNode, className?: string]

function Tip({ title, rows }: { title: React.ReactNode; rows: TipRow[] }) {
  return (
    <div className="grid min-w-40 gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
      <div className="font-medium">{title}</div>
      {rows.map(([l, v, c]) => (
        <div key={l} className="flex justify-between gap-4">
          <span className="text-muted-foreground">{l}</span>
          <span className={cn("font-mono font-medium tabular-nums", c)}>{v}</span>
        </div>
      ))}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>

export function groupRows(d: AnyRow): TipRow[] {
  const rows: TipRow[] = [["Net P&L", money(d.net, true), pnlClass(d.net)]]
  if (d.trades !== undefined) rows.push(["Trades", d.trades])
  if (d.winRate !== undefined) rows.push(["Win rate", pct(d.winRate)])
  if (d.avg !== undefined) rows.push(["Avg / trade", money(d.avg, true), pnlClass(d.avg)])
  return rows
}

const axisTick = { fontSize: 11 }
const yMoney = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))

/* ---------- P&L bar (diverging green / red) ---------- */

export function PnlBars<T extends AnyRow>({
  data,
  xKey = "key",
  valueKey = "net",
  xFormat,
  title,
  rows = groupRows,
  highlight,
  height = 240,
  layout = "horizontal",
  fill = false,
}: {
  data: T[]
  xKey?: string
  valueKey?: string
  xFormat?: (v: string) => string
  title?: (d: T) => React.ReactNode
  rows?: (d: T) => TipRow[]
  highlight?: (d: T) => boolean
  height?: number
  layout?: "horizontal" | "vertical"
  fill?: boolean
}) {
  const vertical = layout === "vertical"
  return (
    <ChartContainer config={config} className={cn("aspect-auto w-full", fill && "h-full flex-1")} style={fill ? { minHeight: height } : { height }}>
      <BarChart data={data} layout={vertical ? "vertical" : "horizontal"} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={vertical} horizontal={!vertical} strokeDasharray="3 3" />
        {vertical ? (
          <>
            <XAxis type="number" tickFormatter={yMoney} tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey={xKey} tickFormatter={xFormat} tick={axisTick} tickLine={false} axisLine={false} width={110} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tickFormatter={xFormat} tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={4} />
            <YAxis tickFormatter={yMoney} tick={axisTick} tickLine={false} axisLine={false} width={44} />
          </>
        )}
        <ReferenceLine {...(vertical ? { x: 0 } : { y: 0 })} stroke="var(--border)" strokeWidth={1.5} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload as T
            return <Tip title={title ? title(d) : xFormat ? xFormat(d[xKey]) : d[xKey]} rows={rows(d)} />
          }}
        />
        <Bar dataKey={valueKey} radius={3} maxBarSize={vertical ? 22 : 36}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d[valueKey] >= 0 ? "var(--profit)" : "var(--loss)"}
              fillOpacity={highlight ? (highlight(d) ? 1 : 0.35) : 0.9}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/* ---------- equity curve ---------- */

export function EquityChart({ data, tz }: { data: { n: number; time: number; equity: number; drawdown: number; net: number }[]; tz: string }) {
  const final = data.at(-1)?.equity ?? 0
  const color = final >= 0 ? "var(--profit)" : "var(--loss)"
  const fmt = (t: number) => new Date(t).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" })
  return (
    <ChartContainer config={config} className="aspect-auto h-full min-h-[280px] w-full flex-1">
      <AreaChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <defs>
          <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="n" tick={axisTick} tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(n) => `#${n}`} />
        <YAxis tickFormatter={yMoney} tick={axisTick} tickLine={false} axisLine={false} width={44} />
        <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
        <ChartTooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            return (
              <Tip
                title={`Trade #${d.n} · ${fmt(d.time)}`}
                rows={[
                  ["Equity", money(d.equity, true), pnlClass(d.equity)],
                  ["This trade", money(d.net, true), pnlClass(d.net)],
                  ["Drawdown", money(d.drawdown), d.drawdown < 0 ? "text-loss" : undefined],
                ]}
              />
            )
          }}
        />
        <Area type="monotone" dataKey="equity" stroke={color} strokeWidth={2} fill="url(#eq)" dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ChartContainer>
  )
}

/* ---------- weekday × hour heatmap ---------- */

export function Heatmap({
  cells,
  weekdays,
}: {
  cells: { trades: number; net: number; winRate: number }[][]
  weekdays: string[]
}) {
  const [hover, setHover] = React.useState<{ d: number; h: number } | null>(null)
  const max = Math.max(1, ...cells.flat().map((c) => Math.abs(c.net)))
  const rows = cells.map((r, d) => ({ r, d })).filter(({ r, d }) => d < 5 || r.some((c) => c.trades))
  const hc = hover ? cells[hover.d][hover.h] : null
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] gap-[2px]" style={{ gridTemplateColumns: "36px repeat(24, minmax(0,1fr))" }}>
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center text-[10px] text-muted-foreground">
              {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
            </div>
          ))}
          {rows.map(({ r, d }) => (
            <React.Fragment key={d}>
              <div className="flex items-center text-xs text-muted-foreground">{weekdays[d]}</div>
              {r.map((c, h) => {
                const a = c.trades ? 0.15 + 0.85 * Math.min(1, Math.abs(c.net) / max) : 0
                return (
                  <div
                    key={h}
                    onMouseEnter={() => setHover({ d, h })}
                    onMouseLeave={() => setHover(null)}
                    className={cn(
                      "h-6 rounded-[3px] bg-muted",
                      hover?.d === d && hover?.h === h && "ring-2 ring-foreground/60"
                    )}
                    style={
                      c.trades
                        ? { background: `color-mix(in oklab, ${c.net >= 0 ? "var(--profit)" : "var(--loss)"} ${Math.round(a * 100)}%, var(--muted))` }
                        : undefined
                    }
                  />
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs">
        <div className="text-muted-foreground">
          {hc && hover ? (
            <span>
              <span className="font-medium text-foreground">
                {weekdays[hover.d]} {String(hover.h).padStart(2, "0")}:00
              </span>{" "}
              · {hc.trades} trades
              {hc.trades > 0 && (
                <>
                  {" "}· <span className={cn("font-mono", pnlClass(hc.net))}>{money(hc.net, true)}</span> · {pct(hc.winRate)} win
                </>
              )}
            </span>
          ) : (
            "Hover a cell for details. Color = net P&L, intensity = size."
          )}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span>Loss</span>
          <span className="h-2.5 w-16 rounded-sm" style={{ background: "linear-gradient(90deg, var(--loss), var(--muted), var(--profit))" }} />
          <span>Profit</span>
        </div>
      </div>
    </div>
  )
}
