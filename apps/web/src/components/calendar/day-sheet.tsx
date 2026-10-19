import { SideBadge } from "@/components/dashboard/side-badge"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import type { LocalTrade } from "@/lib/api/types"
import { formatLongDay, formatTime, money, pct, pnlClass, price } from "@/lib/format"
import { cn } from "@/lib/utils"

type Props = { day: string | null; trades: LocalTrade[]; tz: string; onClose: () => void }

/** Side sheet with the stats and every trade of one day. */
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
              <SheetDescription>Trades opened on this day. Times are in {tz}.</SheetDescription>
            </div>
            <dl className="grid grid-cols-3 gap-2">
              <Stat label="Total trades" value={String(trades.length)} />
              <Stat label="Win rate" value={pct(trades.length ? wins / trades.length : 0)} />
              <Stat label="Net P&L" value={money(net, true)} tone={pnlClass(net)} />
            </dl>
            <ul className="space-y-3">
              {trades.map((t) => (
                <li key={t.ticket} className="rounded-xl border bg-card p-4 shadow-card">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t.symbol}</span>
                    <SideBadge side={t.side} />
                    <span className="text-xs text-muted-foreground">{t.lots} lots</span>
                    <span className={cn("ml-auto font-mono font-medium tabular-nums", pnlClass(t.net))}>{money(t.net, true)}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                    <Field label="Open" value={`${price(t.openPrice)} at ${formatTime(t.open, tz)}`} />
                    <Field label="Close" value={`${price(t.closePrice)} at ${formatTime(t.close, tz)}`} />
                    <Field label="Swap" value={money(t.swap)} />
                    <Field label="Commission" value={money(t.commission)} />
                    <Field label="Stop loss" value={price(t.sl)} />
                    <Field label="Take profit" value={price(t.tp)} />
                  </dl>
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
