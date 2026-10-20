import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useTrades } from "@/hooks/use-api"
import type { Filters } from "@/lib/api/types"
import { duration, formatTimeRange, money, plural, pnlClass, price, relativeDay, tradeKey } from "@/lib/format"
import { ReasonPill } from "./reason-pill"
import { cn } from "@/lib/utils"
import { SideBadge } from "./side-badge"

const PAGE_SIZE = 25
const num = "text-right font-mono tabular-nums"

/** All trades that match the filters, newest first, 25 per page. */
export function TradesTable({ accountId, filters }: { accountId: string; filters: Filters }) {
  const [page, setPage] = React.useState(0)
  const { data, error } = useTrades(accountId, filters, { page, pageSize: PAGE_SIZE })
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))
  const tz = filters.tz

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-card">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="pl-5">Time</TableHead>
            <TableHead>Symbol</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Lots</TableHead>
            <TableHead className="text-right">Open price</TableHead>
            <TableHead className="text-right">Close price</TableHead>
            <TableHead className="text-right">Hold time</TableHead>
            <TableHead>Closed by</TableHead>
            <TableHead className="pr-5 text-right">Net P&L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.rows.map((t, i) => (
            <React.Fragment key={tradeKey(t)}>
            {/* A header row each time the day changes, like Wallet and Mail. */}
            {t.day !== data.rows[i - 1]?.day && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="bg-muted/40 py-1.5 pl-5 text-xs font-semibold text-muted-foreground">
                  {relativeDay(t.day, tz)}
                </TableCell>
              </TableRow>
            )}
            <TableRow>
              <TableCell className="pl-5 font-mono whitespace-nowrap text-muted-foreground">{formatTimeRange(t.open, t.close, tz)}</TableCell>
              <TableCell className="font-medium">{t.symbol}</TableCell>
              <TableCell>
                <SideBadge side={t.side} />
              </TableCell>
              <TableCell className={num}>{t.lots}</TableCell>
              <TableCell className={num}>{price(t.openPrice)}</TableCell>
              <TableCell className={num}>{price(t.closePrice)}</TableCell>
              <TableCell className={cn(num, "whitespace-nowrap")}>{duration(t.durationMin)}</TableCell>
              <TableCell><ReasonPill reason={t.reason} /></TableCell>
              <TableCell className={cn("pr-5", num, pnlClass(t.net))}>{money(t.net, true)}</TableCell>
            </TableRow>
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
      {error && <p role="alert" className="border-t px-5 py-3 text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between border-t px-5 py-3 text-sm text-muted-foreground">
        <span>{data ? plural(data.total, "trade") : "Loading trades…"}</span>
        <div className="flex items-center gap-2">
          <span>Page {page + 1} of {pages}</span>
          <Button variant="outline" size="icon" className="size-8" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" className="size-8" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
