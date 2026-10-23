import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { TradeChartButton } from "@/components/charts/trade-chart-dialog"
import { TradeShareButton } from "./trade-share"
import { TradeReviewCell } from "@/components/journal/trade-review-cell"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useTrades } from "@/hooks/use-api"
import { useNarrow } from "@/hooks/use-media"
import type { Filters, LocalTrade } from "@/lib/api/types"
import { duration, formatTimeRange, money, plural, pnlClass, price, reasonLabel, relativeDay, tradeKey } from "@/lib/format"
import { ReasonPill } from "./reason-pill"
import { cn } from "@/lib/utils"
import { SideBadge } from "./side-badge"

const PAGE_SIZE = 25
const num = "text-right font-mono tabular-nums"

/** All trades that match the filters, newest first, 25 per page. A table from md, a list of rows on phones. */
export function TradesTable({ accountId, filters }: { accountId: string; filters: Filters }) {
  const [page, setPage] = React.useState(0)
  const { data, error } = useTrades(accountId, filters, { page, pageSize: PAGE_SIZE })
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))
  const narrow = useNarrow()
  const rows = data?.rows ?? []
  const props = { accountId, rows, tz: filters.tz }

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-card">
      {narrow ? <TradeList {...props} /> : <TradeTable {...props} />}
      {error && <p role="alert" className="border-t px-5 py-3 text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-2 border-t px-4 py-2 text-sm text-muted-foreground sm:px-5 sm:py-3">
        <span>{data ? plural(data.total, "trade") : "Loading trades…"}</span>
        <div className="flex items-center gap-1 sm:gap-2">
          <span className="tabular-nums">Page {page + 1} of {pages}</span>
          <Button variant="ghost" size="icon-sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  )
}

type Props = { accountId: string; rows: LocalTrade[]; tz: string }

/** Phones: a header for each day, then one row per trade. Net P&L on the right is the number that stands out.
 *  Rows off screen skip layout and paint (content-visibility), so opening a dialog over the list stays quick. */
function TradeList({ accountId, rows, tz }: Props) {
  return (
    <ul className="[&>li]:[contain-intrinsic-size:auto_6.5rem] [&>li]:[content-visibility:auto]">
      {rows.map((t, i) => (
        <React.Fragment key={tradeKey(t)}>
          {t.day !== rows[i - 1]?.day && (
            <li className="border-b bg-muted/40 px-4 py-1.5 text-xs font-semibold text-muted-foreground">{relativeDay(t.day, tz)}</li>
          )}
          <li className="border-b py-3 pr-2 pl-4 last:border-b-0">
            <div className="flex items-center gap-2 pr-2">
              <span className="truncate font-medium">{t.symbol}</span>
              <SideBadge side={t.side} />
              <span className={cn("ml-auto font-mono text-base font-medium tabular-nums", pnlClass(t.net))}>{money(t.net, true)}</span>
            </div>
            {/* Time on the left, the review, chart and share buttons (44px each) on the right. */}
            <div className="-my-1 flex items-center">
              <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground tabular-nums">
                {formatTimeRange(t.open, t.close, tz)} · {duration(t.durationMin)}
              </p>
              <TradeReviewCell ticket={t.ticket} />
              <TradeChartButton compact accountId={accountId} trade={t} tz={tz} />
              <TradeShareButton accountId={accountId} trade={t} tz={tz} />
            </div>
            <p className="pr-2 text-xs text-muted-foreground tabular-nums">
              {t.lots} lots · {price(t.openPrice)} → {price(t.closePrice)} · {reasonLabel(t.reason)}
            </p>
          </li>
        </React.Fragment>
      ))}
    </ul>
  )
}

function TradeTable({ accountId, rows, tz }: Props) {
  const head = "text-xs font-normal text-muted-foreground"
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(head, "pl-5")}>Time</TableHead>
          <TableHead className={head}>Symbol</TableHead>
          <TableHead className={head}>Side</TableHead>
          <TableHead className={cn(head, "text-right")}>Lots</TableHead>
          <TableHead className={cn(head, "text-right")}>Open price</TableHead>
          <TableHead className={cn(head, "text-right")}>Close price</TableHead>
          <TableHead className={cn(head, "text-right")}>Hold time</TableHead>
          <TableHead className={head}>Closed by</TableHead>
          <TableHead className={cn(head, "pr-5 text-right")}>Net P&L</TableHead>
          <TableHead className="w-px pr-3"><span className="sr-only">Review</span></TableHead>
          <TableHead className="w-10 pr-3"><span className="sr-only">Chart and share</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((t, i) => (
          <React.Fragment key={tradeKey(t)}>
            {/* A header row each time the day changes, like Wallet and Mail. */}
            {t.day !== rows[i - 1]?.day && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={11} className="bg-muted/40 py-1.5 pl-5 text-xs font-semibold text-muted-foreground">
                  {relativeDay(t.day, tz)}
                </TableCell>
              </TableRow>
            )}
            <TableRow className="group">
              <TableCell className="pl-5 font-mono whitespace-nowrap text-muted-foreground">{formatTimeRange(t.open, t.close, tz)}</TableCell>
              <TableCell className="font-medium">{t.symbol}</TableCell>
              <TableCell><SideBadge side={t.side} /></TableCell>
              <TableCell className={cn(num, "text-muted-foreground")}>{t.lots}</TableCell>
              <TableCell className={cn(num, "text-muted-foreground")}>{price(t.openPrice)}</TableCell>
              <TableCell className={cn(num, "text-muted-foreground")}>{price(t.closePrice)}</TableCell>
              <TableCell className={cn(num, "whitespace-nowrap text-muted-foreground")}>{duration(t.durationMin)}</TableCell>
              <TableCell><ReasonPill reason={t.reason} /></TableCell>
              <TableCell className={cn("pr-5 font-medium", num, pnlClass(t.net))}>{money(t.net, true)}</TableCell>
              <TableCell className="py-1 pr-3"><TradeReviewCell ticket={t.ticket} /></TableCell>
              <TableCell className="py-0 pr-3">
                <div className="flex items-center">
                  <TradeChartButton compact accountId={accountId} trade={t} tz={tz} />
                  <TradeShareButton accountId={accountId} trade={t} tz={tz} />
                </div>
              </TableCell>
            </TableRow>
          </React.Fragment>
        ))}
      </TableBody>
    </Table>
  )
}
