import * as React from "react"
import type { Side } from "@/lib/api/types"
import { duration, formatTime, formatTimeRange, hourShort, money, pnlClass } from "@/lib/format"
import { type Span, hourTicks, hourWindow, inMarket, lanes, toSpan } from "@/lib/timeline"
import { cn } from "@/lib/utils"

/** What the timeline needs from a trade or a position. */
export type TimelineTrade = { id: string; open: string; close: string; net: number; symbol: string; side: Side; lots: number }

const pctOf = (min: number, w: { from: number; to: number }) => ((min - w.from) / (w.to - w.from)) * 100
const barTone = (net: number) => (net > 0 ? "bg-profit" : net < 0 ? "bg-loss" : "bg-muted-foreground")

/** Left and width of a bar, at least `minPx` wide so a 10-second trade still shows. */
const place = (s: Span, w: { from: number; to: number }, minPx = 6): React.CSSProperties => {
  const left = pctOf(s.start, w)
  return { left: `${left}%`, width: `${pctOf(s.end, w) - left}%`, minWidth: minPx }
}

type Props = {
  trades: TimelineTrade[]
  day: string
  tz: string
  /** Called with the trade's id when its row is clicked. */
  onSelect?: (id: string) => void
  className?: string
}

/** The day as a Gantt chart: one row per trade from open to close, oldest first, with the time in the market on top.
 *  Bars that sit above each other were open at the same time. */
export function DayTimeline({ trades, day, tz, onSelect, className }: Props) {
  const rows = React.useMemo(
    () => trades.map((t) => ({ t, s: toSpan(t, day, tz) })).sort((a, b) => a.s.start - b.s.start),
    [trades, day, tz]
  )
  const w = hourWindow(rows.map((r) => r.s))
  const ticks = hourTicks(w)
  const market = inMarket(rows.map((r) => r.s))
  const marketMin = market.reduce((s, m) => s + m.end - m.start, 0)
  const [hover, setHover] = React.useState<string | null>(null)

  if (!rows.length) return null
  // Label, track, P&L. The track holds the hour lines for every row.
  const grid = "grid grid-cols-[4.75rem_minmax(0,1fr)_4.5rem] items-center gap-x-3 @xl:grid-cols-[8.5rem_minmax(0,1fr)_5.5rem]"

  return (
    <div className={cn("@container relative text-sm", className)}>
      <div className={grid}>
        <div aria-hidden className="relative col-start-2 h-6">
          {ticks.map((m) => (
            <span key={m} className="absolute top-0 -translate-x-1/2 font-mono text-[11px] text-muted-foreground" style={{ left: `${pctOf(m, w)}%` }}>
              {hourShort(m / 60)}
            </span>
          ))}
        </div>
        <span aria-hidden />

        <span className="text-xs whitespace-nowrap text-muted-foreground">In market</span>
        <div className="relative h-7" role="img" aria-label={`In the market for ${duration(marketMin)}`}>
          <HourLines ticks={ticks} w={w} />
          {market.map((m) => (
            <div key={m.start} className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/70" style={place({ id: "", net: 0, ...m }, w)} />
          ))}
        </div>
        <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">{duration(marketMin)}</span>

        <div className="col-span-3 my-1 border-t" aria-hidden />

        {rows.map(({ t, s }, i) => {
          const on = hover === t.id
          const label = `${t.symbol} ${t.side}, ${t.lots} lots, ${formatTimeRange(t.open, t.close, tz)}, ${duration(s.end - s.start)}, ${money(t.net, true)}`
          const cells = (
            <>
              <span className="flex min-w-0 flex-col leading-tight @xl:flex-row @xl:items-baseline @xl:gap-2">
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatTime(t.open, tz)}</span>
                <span className="truncate font-medium">{t.symbol}</span>
              </span>
              <span className="relative block h-10 @xl:h-8">
                <HourLines ticks={ticks} w={w} />
                <span
                  className={cn(
                    "timeline-bar absolute top-1/2 h-3 -translate-y-1/2 rounded-full transition-opacity duration-150",
                    barTone(t.net),
                    hover && !on ? "opacity-35" : "opacity-90",
                    on && "opacity-100 ring-2 ring-foreground/20 ring-offset-1 ring-offset-card"
                  )}
                  style={{ ...place(s, w), animationDelay: `${Math.min(i, 12) * 25}ms` }}
                />
                {on && <Tip trade={t} span={s} tz={tz} left={pctOf((s.start + s.end) / 2, w)} />}
              </span>
              <span className={cn("text-right font-mono text-sm font-medium tabular-nums", pnlClass(t.net))}>{money(t.net, true)}</span>
            </>
          )
          const rowClass = cn(grid, "col-span-3 rounded-lg px-0 text-left")
          return onSelect ? (
            <button
              key={t.id}
              type="button"
              aria-label={`${label}. Open the price chart.`}
              onClick={() => onSelect(t.id)}
              onPointerEnter={() => setHover(t.id)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(t.id)}
              onBlur={() => setHover(null)}
              className={cn(rowClass, "cursor-pointer transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none")}
            >
              {cells}
            </button>
          ) : (
            <div key={t.id} aria-label={label} role="listitem" className={rowClass} onPointerEnter={() => setHover(t.id)} onPointerLeave={() => setHover(null)}>
              {cells}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Dashed hour lines across one track. */
function HourLines({ ticks, w }: { ticks: number[]; w: { from: number; to: number } }) {
  return ticks.map((m) => (
    <span key={m} aria-hidden className="absolute inset-y-0 border-l border-dashed border-border" style={{ left: `${pctOf(m, w)}%` }} />
  ))
}

function Tip({ trade: t, span: s, tz, left }: { trade: TimelineTrade; span: Span; tz: string; left: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-full z-20 mb-1 w-max -translate-x-1/2 rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-lg"
      style={{ left: `${Math.min(85, Math.max(15, left))}%` }}
    >
      <span className="font-medium">{t.symbol} · {t.side === "buy" ? "Buy" : "Sell"} {t.lots} lots</span>
      <span className="block font-mono text-muted-foreground tabular-nums">
        {formatTimeRange(t.open, t.close, tz)} · {duration(s.end - s.start)}
      </span>
    </span>
  )
}

const LANE_H = 5
const LANE_GAP = 2
const MAX_LANES = 3

/** A one-line picture of a day: each trade a short bar from open to close, stacked when they overlap.
 *  `focus` stands out and the others fade, for the review card. */
export function SessionStrip({ trades, day, tz, focus, className }: { trades: TimelineTrade[]; day: string; tz: string; focus?: string; className?: string }) {
  const spans = React.useMemo(() => lanes(trades.map((t) => toSpan(t, day, tz))), [trades, day, tz])
  if (!spans.length) return null
  const w = hourWindow(spans, 1)
  const used = Math.min(MAX_LANES, Math.max(...spans.map((s) => s.lane)) + 1)
  return (
    <div className={cn("flex items-center gap-2", className)} aria-hidden>
      <span className="w-9 shrink-0 text-right font-mono text-[10px] text-muted-foreground">{hourShort(w.from / 60)}</span>
      <div className="relative flex-1 rounded-full bg-muted/70" style={{ height: used * (LANE_H + LANE_GAP) + LANE_GAP }}>
        {spans.map((s) => (
          <div
            key={s.id}
            className={cn(
              "absolute rounded-full",
              barTone(s.net),
              focus ? (s.id === focus ? "opacity-100 ring-2 ring-foreground/30" : "opacity-25") : "opacity-80"
            )}
            style={{ ...place(s, w, 3), top: LANE_GAP + Math.min(s.lane, MAX_LANES - 1) * (LANE_H + LANE_GAP), height: LANE_H }}
          />
        ))}
      </div>
      <span className="w-9 shrink-0 font-mono text-[10px] text-muted-foreground">{hourShort(w.to / 60)}</span>
    </div>
  )
}
