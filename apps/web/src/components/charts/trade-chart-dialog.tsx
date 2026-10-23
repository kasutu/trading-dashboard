import * as React from "react"
import { CandlestickChart } from "lucide-react"
import { pillGroup, pillItem } from "@/components/dashboard/filter-bar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Input } from "@/components/ui/input"
import { SaveStatus } from "@/components/journal/save-status"
import { TradeShareButton } from "@/components/dashboard/trade-share"
import { useTradeAnswers } from "@/hooks/use-answers"
import { useCandles } from "@/hooks/use-api"
import { useJournalContext } from "@/hooks/use-journal"
import type { Candle, LocalTrade, Timeframe } from "@/lib/api/types"
import { duration, formatTimeRange, money, pnlClass, price, relativeDay, tzLabel } from "@/lib/format"
import { formatR, rFrom } from "@/lib/journal"
import { MAX_CANDLES, TIMEFRAMES, candleWindow, pickTimeframe } from "@/lib/timeframes"
import { cn } from "@/lib/utils"
import type { Level, Levels } from "./trade-chart"

// Lightweight Charts loads only when a chart is opened.
const TradeChart = React.lazy(() => import("./trade-chart").then((m) => ({ default: m.TradeChart })))

type Props = { accountId: string; trade: LocalTrade; tz: string }

/** A button that opens the trade's price chart. `compact` shows only the icon (for table rows). */
export function TradeChartButton({ compact, className, ...props }: Props & { compact?: boolean; className?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      {compact ? (
        <Button variant="ghost" size="icon-sm" className={cn("text-muted-foreground", className)} onClick={() => setOpen(true)} aria-label="Price chart" title="Price chart">
          <CandlestickChart />
        </Button>
      ) : (
        <Button variant="outline" size="xs" className={className} onClick={() => setOpen(true)}>
          <CandlestickChart />
          Chart
        </Button>
      )}
      <TradeChartDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  )
}

/** The price chart of one trade in a dialog, with a timeframe toggle. */
export function TradeChartDialog({ open, onOpenChange, ...props }: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-4 sm:max-w-3xl sm:p-6">{open && <ChartBody {...props} />}</DialogContent>
    </Dialog>
  )
}

function ChartBody(props: Props) {
  // Positions come from the journal. Without one there is no review to save the levels to, so the chart is read-only.
  const editable = !!useJournalContext()?.positions.get(props.trade.ticket)
  return editable ? <EditableBody {...props} /> : <Body {...props} />
}

/** The chart with draggable SL and TP, saved to the trade's review as the planned stop and target. */
function EditableBody(props: Props) {
  const { trade } = props
  const answers = useTradeAnswers(trade.ticket)
  const { v, set } = answers
  const levels: Levels = { sl: v.initialStop ?? trade.sl, tp: v.initialTarget ?? trade.tp }
  const onLevel = (level: Level, p: number | null) => set(level === "sl" ? { initialStop: p } : { initialTarget: p })
  const changed = v.initialStop !== null || v.initialTarget !== null
  const risk = levels.sl === null ? null : Math.abs(trade.openPrice - levels.sl)
  const reward = levels.tp === null ? null : Math.abs(levels.tp - trade.openPrice)
  const r = rFrom(trade, levels.sl)

  return (
    <Body {...props} levels={levels} onLevel={onLevel}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <LevelInput label="SL" trade={trade} level="sl" value={levels.sl} onSave={(p) => onLevel("sl", p)} />
        <LevelInput label="TP" trade={trade} level="tp" value={levels.tp} onSave={(p) => onLevel("tp", p)} />
        <span className="text-muted-foreground">
          R:R <span className="font-mono text-foreground tabular-nums">{risk && reward ? `1:${(reward / risk).toFixed(1)}` : "—"}</span>
        </span>
        <span className="text-muted-foreground">
          Result <span className={cn("font-mono tabular-nums", r === null ? "text-foreground" : pnlClass(r))}>{r === null ? "—" : formatR(r)}</span>
        </span>
        <SaveStatus state={answers.state} />
        {changed && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => set({ initialStop: null, initialTarget: null })}>
            Reset
          </Button>
        )}
      </div>
    </Body>
  )
}

/** A price field for SL or TP. Saves on Enter or when focus leaves, if the price is on the right side of the entry. */
function LevelInput({ label, trade, level, value, onSave }: { label: string; trade: LocalTrade; level: Level; value: number | null; onSave: (p: number | null) => void }) {
  const [text, setText] = React.useState<string | null>(null)
  const shown = text ?? (value === null ? "" : price(value))
  const n = shown.trim() ? Number(shown.replace(",", ".")) : null
  const below = (level === "sl") === (trade.side === "buy")
  const ok = n === null || (Number.isFinite(n) && n > 0 && (below ? n < trade.openPrice : n > trade.openPrice))
  const commit = () => {
    if (text !== null && ok && n !== value) onSave(n)
    if (ok) setText(null)
  }
  return (
    <label className="flex items-center gap-1.5">
      <span className={cn("text-xs font-medium", level === "sl" ? "text-loss" : "text-profit")}>{label}</span>
      <Input
        inputMode="decimal"
        autoComplete="off"
        value={shown}
        placeholder={below ? "Below entry" : "Above entry"}
        aria-invalid={!ok}
        title={ok ? undefined : `${label} goes ${below ? "below" : "above"} the entry (${price(trade.openPrice)}).`}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="h-8 w-28 font-mono tabular-nums"
      />
    </label>
  )
}

function Body({ accountId, trade, tz, levels, onLevel, children }: Props & { levels?: Levels; onLevel?: (level: Level, p: number) => void; children?: React.ReactNode }) {
  const [tf, setTf] = React.useState<Timeframe>(() => pickTimeframe(trade.durationMin))
  const range = React.useMemo(() => candleWindow(trade.open, trade.close, tf), [trade.open, trade.close, tf])
  const { data, error, loading } = useCandles(accountId, trade.symbol, tf, range)
  const side = trade.side === "buy" ? "Buy" : "Sell"

  return (
    <>
      <div className="flex items-start gap-3 pr-8">
        <div className="min-w-0 space-y-1">
          <DialogTitle className="font-display text-lg font-bold">
            {trade.symbol} · {side} {trade.lots} lots
          </DialogTitle>
          <DialogDescription className="font-mono">
            {relativeDay(trade.day, tz)}, {formatTimeRange(trade.open, trade.close, tz)}{" "}
            <span className="whitespace-nowrap"><span aria-hidden>·</span> {duration(trade.durationMin)}</span>
          </DialogDescription>
        </div>
        <span className={cn("ml-auto font-mono text-lg font-medium whitespace-nowrap tabular-nums", pnlClass(trade.net))}>{money(trade.net, true)}</span>
        <TradeShareButton accountId={accountId} trade={trade} tz={tz} className="-my-1" />
      </div>

      <ToggleGroup
        type="single"
        size="sm"
        spacing={1}
        className={cn(pillGroup, "w-fit")}
        value={tf}
        onValueChange={(v) => v && setTf(v as Timeframe)}
        aria-label="Timeframe"
      >
        {TIMEFRAMES.map(([k]) => (
          <ToggleGroupItem key={k} value={k} className={pillItem} disabled={candleWindow(trade.open, trade.close, k).count > MAX_CANDLES}>
            {k}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="relative min-w-0" aria-busy={loading}>
        <React.Suspense fallback={<Placeholder />}>
          {data ? (
            <TradeChart
              trade={trade}
              candles={data.candles}
              tf={data.tf}
              tz={tz}
              levels={levels}
              onLevel={onLevel}
              className={cn("transition-opacity", loading && "opacity-60")}
            />
          ) : (
            <Placeholder text={error ? "" : "Loading prices…"} />
          )}
        </React.Suspense>
        {error && (
          <p role="alert" className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      {children}

      {data && offChart(trade, data.candles) && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          These prices are far from your fills, so the market data may be for a different instrument than your broker's {trade.symbol}.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {data && data.tf !== tf && `${tf} candles are not available this far back, so these are ${data.tf}. `}
        Times in {tzLabel(tz)}.{onLevel && " Drag the SL and TP lines to set your plan."}
      </p>
    </>
  )
}

/** The entry or exit is more than 3% outside the candles' range. */
function offChart(t: LocalTrade, candles: Candle[]) {
  if (!candles.length) return false
  const low = Math.min(...candles.map((c) => c.low))
  const high = Math.max(...candles.map((c) => c.high))
  return [t.openPrice, t.closePrice].some((p) => p < low * 0.97 || p > high * 1.03)
}

function Placeholder({ text = "Loading prices…" }: { text?: string }) {
  return <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground sm:h-[360px]">{text}</div>
}
