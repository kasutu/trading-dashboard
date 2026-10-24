import { TradeTimeline } from "@/components/charts/day-timeline-dialog"
import { TradeChartButton } from "@/components/charts/trade-chart-dialog"
import { TradeShareButton } from "@/components/dashboard/trade-share"
import { SideBadge } from "@/components/dashboard/side-badge"
import { YourDay } from "@/components/journal/day-review"
import { TradeReviewPanel } from "@/components/journal/trade-review-panel"
import { MetricBlock } from "@/components/dashboard/panel"
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { LocalTrade } from "@/lib/api/types"
import { duration, formatLongDay, formatTimeRange, money, pct, pnlClass, price, today, tradeKey, tzLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

type Props = { accountId: string; day: string | null; trades: LocalTrade[]; tz: string; onClose: () => void }

/** Side sheet for one day: its stats and timeline, your day review, and every trade with its review. */
export function DaySheet({ accountId, day, trades, tz, onClose }: Props) {
  const net = trades.reduce((s, t) => s + t.net, 0)
  const wins = trades.filter((t) => t.net > 0).length

  return (
    <Sheet open={day !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-lg">
        {day && (
          <>
          <SheetHeader>
            <SheetTitle className="text-base font-semibold">{formatLongDay(day)}</SheetTitle>
            <SheetDescription className="text-xs sm:text-sm">Trades opened on this day. Times are in {tzLabel(tz)}.</SheetDescription>
          </SheetHeader>
          <SheetBody className="gap-5">
            {trades.length ? (
              <>
                <MetricBlock
                  metric={{
                    value: money(net, true),
                    tone: net,
                    label: "Net P&L on the day",
                    stats: [["Trades", trades.length], ["Win rate", pct(wins / trades.length)]],
                  }}
                />
                <section aria-label="Timeline" className="rounded-xl border bg-card p-4 shadow-card">
                  <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
                  <TradeTimeline accountId={accountId} trades={trades} day={day} tz={tz} />
                </section>
              </>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">{day === today(tz) ? "No trades yet today." : "No trades on this day."}</p>
            )}
            <YourDay day={day} />
            <ul className="space-y-3">
              {trades.map((t) => (
                <li key={tradeKey(t)} className="rounded-xl border bg-card p-4 shadow-card">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t.symbol}</span>
                    <SideBadge side={t.side} />
                    <span className="text-xs text-muted-foreground">{t.lots} lots</span>
                    <span className={cn("ml-auto font-mono font-medium tabular-nums", pnlClass(t.net))}>{money(t.net, true)}</span>
                    <span className="-my-2 -mr-3 flex items-center sm:-my-1 sm:-mr-2">
                      <TradeChartButton compact accountId={accountId} trade={t} tz={tz} />
                      <TradeShareButton accountId={accountId} trade={t} tz={tz} />
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-sm text-muted-foreground">
                    {formatTimeRange(t.open, t.close, tz)}, {duration(t.durationMin)}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                    <Field label="Open price" value={price(t.openPrice)} />
                    <Field label="Close price" value={price(t.closePrice)} />
                    <Field label="Swap" value={money(t.swap)} />
                    <Field label="Commission" value={money(t.commission)} />
                    <Field label="Stop loss" value={price(t.sl)} />
                    <Field label="Take profit" value={price(t.tp)} />
                  </dl>
                  <TradeReviewPanel ticket={t.ticket} />
                </li>
              ))}
            </ul>
          </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  )
}
