import { compactMoney, money } from "@/lib/format"
import type { Viz } from "@/lib/insights"
import { cn } from "@/lib/utils"

const fill = (v: number) => (v >= 0 ? "var(--profit)" : "var(--loss)")

/** Small chart under a note. */
export function InsightViz({ viz }: { viz: Viz }) {
  return viz.kind === "bars" ? <MiniBars bars={viz.bars} /> : <CompareBars rows={viz.rows} />
}

/** One bar per group around a zero line. The groups the note is about are solid, the rest are faint. */
function MiniBars({ bars }: { bars: Extract<Viz, { kind: "bars" }>["bars"] }) {
  const H = 44
  const hi = Math.max(0, ...bars.map((b) => b.value))
  const lo = Math.min(0, ...bars.map((b) => b.value))
  const span = hi - lo || 1
  const zero = (hi / span) * H
  const n = bars.length
  // Label every bar when there is room. Else label the solid bars first, then the ends,
  // and skip any label that would touch one already placed.
  const shown = new Set<number>()
  const order = n <= 8 ? bars.map((_, i) => i) : [...bars.flatMap((b, i) => (b.on ? [i] : [])), 0, n - 1]
  for (const i of order)
    if (n <= 8 || ![...shown].some((j) => Math.abs(j - i) < 3)) shown.add(i)
  const showLabel = (i: number) => shown.has(i)

  return (
    <div className="mt-2" aria-hidden>
      <svg viewBox={`0 0 ${n * 10} ${H}`} preserveAspectRatio="none" className="block h-11 w-full overflow-visible">
        {bars.map((b, i) => {
          const h = Math.max(1, (Math.abs(b.value) / span) * H)
          return (
            <rect
              key={i}
              x={i * 10 + 1.5}
              width={7}
              y={b.value >= 0 ? zero - h : zero}
              height={h}
              rx={1.5}
              fill={fill(b.value)}
              fillOpacity={b.on ? 1 : 0.22}
            >
              <title>{`${b.label}: ${money(b.value, true)}`}</title>
            </rect>
          )
        })}
        <line x1={0} x2={n * 10} y1={zero} y2={zero} stroke="var(--muted-foreground)" strokeOpacity={0.35} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 grid font-mono text-[10px] leading-none text-muted-foreground" style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}>
        {bars.map((b, i) => (
          <span key={i} className={cn("whitespace-nowrap", i === 0 ? "text-left" : i === n - 1 ? "text-right [direction:rtl]" : "text-center", b.on && "font-semibold text-foreground")}>
            {showLabel(i) ? b.label : ""}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Horizontal bars for a before/after or this/that comparison. */
function CompareBars({ rows }: { rows: Extract<Viz, { kind: "compare" }>["rows"] }) {
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)))
  // One format for all rows: compact when any value is large.
  const fmt = (v: number) => (max >= 1000 ? `${v < 0 ? "−" : ""}$${compactMoney(Math.abs(v))}` : money(v))
  return (
    <div className="mt-2 space-y-1.5" aria-hidden>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-2 text-xs">
          <span className={cn("truncate", r.on ? "font-medium text-foreground" : "text-muted-foreground")}>{r.label}</span>
          <span className="h-2 rounded-full bg-muted">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(Math.abs(r.value) / max) * 100}%`, background: fill(r.value), opacity: r.on ? 1 : 0.35 }}
            />
          </span>
          <span className={cn("text-right font-mono tabular-nums", r.on ? "text-foreground" : "text-muted-foreground")}>
            {fmt(r.value)}
          </span>
        </div>
      ))}
    </div>
  )
}
