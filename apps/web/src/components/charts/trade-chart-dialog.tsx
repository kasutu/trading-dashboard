import * as React from "react"
import { CandlestickChart } from "lucide-react"
import { pillGroup, pillItem } from "@/components/dashboard/filter-bar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useCandles } from "@/hooks/use-api"
import type { LocalTrade, Timeframe } from "@/lib/api/types"
import { duration, formatTimeRange, money, pnlClass, relativeDay, tzLabel } from "@/lib/format"
import { MAX_CANDLES, TIMEFRAMES, candleWindow, pickTimeframe } from "@/lib/timeframes"
import { cn } from "@/lib/utils"

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

function ChartBody({ accountId, trade, tz }: Props) {
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
            <TradeChart trade={trade} candles={data.candles} tf={data.tf} tz={tz} className={cn("transition-opacity", loading && "opacity-60")} />
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

      <p className="text-xs text-muted-foreground">
        Times in {tzLabel(tz)}. The shaded area is the time the trade was open.
        {import.meta.env.VITE_MOCK && " Sample prices for the prototype."}
      </p>
    </>
  )
}

function Placeholder({ text = "Loading prices…" }: { text?: string }) {
  return <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground sm:h-[360px]">{text}</div>
}
