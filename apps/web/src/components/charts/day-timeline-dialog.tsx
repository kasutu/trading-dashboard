import * as React from "react"
import { MetricBlock } from "@/components/dashboard/panel"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useTrades } from "@/hooks/use-api"
import type { Filters, LocalTrade } from "@/lib/api/types"
import { formatLongDay, money, plural, tradeKey, tzLabel } from "@/lib/format"
import { DayTimeline } from "./day-timeline"
import { TradeChartDialog } from "./trade-chart-dialog"

/** The day timeline of some trades. Clicking a row opens that trade's price chart. */
export function TradeTimeline({ accountId, trades, day, tz }: { accountId: string; trades: LocalTrade[]; day: string; tz: string }) {
  const [picked, setPicked] = React.useState<LocalTrade | null>(null)
  const items = React.useMemo(() => trades.map((t) => ({ ...t, id: tradeKey(t) })), [trades])
  return (
    <>
      <DayTimeline trades={items} day={day} tz={tz} onSelect={(id) => setPicked(items.find((t) => t.id === id) ?? null)} />
      {picked && (
        <TradeChartDialog accountId={accountId} trade={picked} tz={tz} open onOpenChange={(o) => !o && setPicked(null)} />
      )}
    </>
  )
}

type Props = { accountId: string; filters: Filters; day: string | null; onClose: () => void; children?: React.ReactNode }

/** One day's timeline in a dialog, for charts that pick a day. `children` shows under the title. */
export function DayTimelineDialog({ accountId, filters, day, onClose, children }: Props) {
  return (
    <Dialog open={day !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="full" className="sm:max-w-3xl">{day && <Body accountId={accountId} filters={filters} day={day}>{children}</Body>}</DialogContent>
    </Dialog>
  )
}

function Body({ accountId, filters, day, children }: { accountId: string; filters: Filters; day: string; children?: React.ReactNode }) {
  const { data, error } = useTrades(accountId, filters, { from: day, to: day, pageSize: 500 })
  const trades = React.useMemo(() => [...(data?.rows ?? [])].reverse(), [data])
  const net = trades.reduce((s, t) => s + t.net, 0)
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-base font-semibold">{formatLongDay(day)}</DialogTitle>
        <DialogDescription className="text-xs sm:text-sm">Times in {tzLabel(filters.tz)}. Tap a trade to see its price chart.</DialogDescription>
      </DialogHeader>
      <DialogBody>
      {data && <MetricBlock metric={{ value: money(net, true), tone: net, label: `Net P&L on ${plural(trades.length, "trade")}` }} />}
      {children}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!data ? (
        !error && <p className="py-12 text-center text-sm text-muted-foreground">Loading trades…</p>
      ) : (
        <div className="pt-2">
          <TradeTimeline accountId={accountId} trades={trades} day={day} tz={filters.tz} />
        </div>
      )}
      </DialogBody>
    </>
  )
}
