import { SideBadge } from "@/components/dashboard/side-badge"
import { DayJournal } from "@/components/journal/day-journal"
import { TradeNote } from "@/components/journal/trade-note"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import type { LocalTrade } from "@/lib/api/types"
import { duration, formatLongDay, formatTimeRange, money, pct, pnlClass, price, today, tradeKey, tzLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

type Props = { day: string | null; trades: LocalTrade[]; tz: string; onClose: () => void }

/** Side sheet with your mood and note for one day, its stats and every trade. */
export function DaySheet({ day, trades, tz, onClose }: Props) {
  const net = trades.reduce((s, t) => s + t.net, 0)
  const wins = trades.filter((t) => t.net > 0).length

  return (
    <Sheet open={day !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        {day && (
          <div className="space-y-5 p-5">
            <div className="space-y-1 pr-8">
              <SheetTitle className="font-display text-xl font-bold">{formatLongDay(day)}</SheetTitle>
              <SheetDescription>Trades opened on this day. Times are in {tzLabel(tz)}.</SheetDescription>
            </div>
            <DayJournal day={day} />
            {trades.length ? (
              <dl className="grid grid-cols-3 gap-2">
                <Stat label="Total trades" value={String(trades.length)} />
                <Stat label="Win rate" value={pct(wins / trades.length)} />
                <Stat label="Net P&L" value={money(net, true)} tone={pnlClass(net)} />
              </dl>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">{day === today(tz) ? "No trades yet today." : "No trades on this day."}</p>
            )}
            <ul className="space-y-3">
              {trades.map((t) => (
                <li key={tradeKey(t)} className="rounded-xl border bg-card p-4 shadow-card">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t.symbol}</span>
                    <SideBadge side={t.side} />
                    <span className="text-xs text-muted-foreground">{t.lots} lots</span>
                    <span className={cn("ml-auto font-mono font-medium tabular-nums", pnlClass(t.net))}>{money(t.net, true)}</span>
                  </div>
                  <p className="mt-1 font-mono text-sm text-muted-foreground">
                    {formatTimeRange(t.open, t.close, tz)} <span aria-hidden>·</span> {duration(t.durationMin)}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                    <Field label="Open price" value={price(t.openPrice)} />
                    <Field label="Close price" value={price(t.closePrice)} />
                    <Field label="Swap" value={money(t.swap)} />
                    <Field label="Commission" value={money(t.commission)} />
                    <Field label="Stop loss" value={price(t.sl)} />
                    <Field label="Take profit" value={price(t.tp)} />
                  </dl>
                  <TradeNote ticket={t.ticket} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 font-mono text-lg font-medium tabular-nums", tone)}>{value}</dd>
    </div>
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
