import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { formatDateTime, money, pnlClass } from "@/lib/format"
import type { EquityPoint } from "@/lib/api/types"
import { chartConfig, type TipRow } from "./chart-config"
import { ChartTip } from "./chart-tip"

const TAG_W = 76 // right margin for the value tags

const toneOf = (v: number) => (v >= 0 ? "var(--profit)" : "var(--loss)")

/** Cumulative net P&L, one point per closed trade. Marks the highest and lowest points. */
export function EquityChart({ data, tz }: { data: EquityPoint[]; tz: string }) {
  const color = toneOf(data.at(-1)?.equity ?? 0)
  const high = data.reduce((a, b) => (b.equity > a.equity ? b : a))
  const low = data.reduce((a, b) => (b.equity < a.equity ? b : a))
  const lastN = data.at(-1)!.n
  const marks = high.equity !== low.equity
  // Put the word on the side of the dot that faces the middle, so it never clips at an edge.
  const side = (p: EquityPoint): "right" | "left" => (p.n < lastN / 2 ? "right" : "left")

  return (
    <div className="flex min-h-[200px] min-w-0 flex-col gap-2 sm:min-h-[260px]">
      <ChartContainer config={chartConfig} className="aspect-auto h-full min-h-[200px] w-full flex-1 sm:min-h-[260px]">
        <AreaChart data={data} margin={{ left: 10, right: marks ? TAG_W : 4, top: 18, bottom: 18 }}>
          <defs>
            <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="2 4" strokeOpacity={0.6} />
          <XAxis dataKey="n" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />

          {/* Faint guide from each extreme to the price axis */}
          {marks && <ReferenceLine segment={[{ x: high.n, y: high.equity }, { x: lastN, y: high.equity }]} stroke={toneOf(high.equity)} strokeOpacity={0.45} strokeDasharray="2 3" />}
          {marks && <ReferenceLine segment={[{ x: low.n, y: low.equity }, { x: lastN, y: low.equity }]} stroke={toneOf(low.equity)} strokeOpacity={0.45} strokeDasharray="2 3" />}
          {/* Value tags in the right margin. These lines are invisible and only place the tags. */}
          {marks && <ReferenceLine y={high.equity} stroke="none" label={(p: TagProps) => <AxisTag {...p} value={high.equity} />} />}
          {marks && <ReferenceLine y={low.equity} stroke="none" label={(p: TagProps) => <AxisTag {...p} value={low.equity} />} />}

          <ChartTooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as EquityPoint
              const rows: TipRow[] = [
                ["Equity", money(d.equity, true), pnlClass(d.equity)],
                ["Trade", `${d.n} of ${data.length}`],
                ["This trade", money(d.net, true), pnlClass(d.net)],
                ["Drawdown", money(d.drawdown), d.drawdown < 0 ? "text-loss" : undefined],
              ]
              return <ChartTip title={formatDateTime(new Date(d.time).toISOString(), tz)} rows={rows} />
            }}
          />
          <Area type="monotone" dataKey="equity" stroke={color} strokeWidth={2} fill="url(#equity-fill)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />

          {marks && <ReferenceDot ifOverflow="visible" x={high.n} y={high.equity} r={4} fill={toneOf(high.equity)} stroke="var(--card)" strokeWidth={2} label={{ value: "High", position: side(high), offset: 8, ...wordStyle }} />}
          {marks && <ReferenceDot ifOverflow="visible" x={low.n} y={low.equity} r={4} fill={toneOf(low.equity)} stroke="var(--card)" strokeWidth={2} label={{ value: "Low", position: side(low), offset: 8, ...wordStyle }} />}
        </AreaChart>
      </ChartContainer>
    </div>
  )
}

const wordStyle = { fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--muted-foreground)" }

type TagProps = { viewBox?: { x?: number; y?: number; width?: number } }

/** Outlined value tag in the right margin, on the level it marks. */
function AxisTag({ viewBox, value }: TagProps & { value: number }) {
  const x = (viewBox?.x ?? 0) + (viewBox?.width ?? 0) + 4
  const y = viewBox?.y ?? 0
  const text = money(value, true)
  const w = text.length * 6 + 10 // ponytail: width estimated for a 10px mono font
  const tone = toneOf(value)
  return (
    <g>
      <rect x={x} y={y - 9} width={w} height={18} rx={4} fill="var(--card)" stroke={tone} strokeOpacity={0.6} />
      <text x={x + w / 2} y={y + 3.5} textAnchor="middle" fontSize={10} fontFamily="var(--font-mono)" fontWeight={600} fill={tone}>
        {text}
      </text>
    </g>
  )
}
