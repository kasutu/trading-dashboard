import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { duration, money, plural, pnlClass } from "@/lib/format"
import { formatDateTime, reasonLabel, type LocalTrade } from "@/lib/trades"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25
const num = "text-right font-mono tabular-nums"

/** All trades, newest first, 25 per page. */
export function TradesTable({ ts, tz }: { ts: LocalTrade[]; tz: string }) {
  const [page, setPage] = React.useState(0)
  const sorted = React.useMemo(() => [...ts].sort((a, b) => +b.open - +a.open), [ts])
  const pages = Math.ceil(sorted.length / PAGE_SIZE)
  const p = Math.min(page, pages - 1)
  const rows = sorted.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE)

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="pl-5">Opened</TableHead>
            <TableHead>Symbol</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Lots</TableHead>
            <TableHead className="text-right">Open price</TableHead>
            <TableHead className="text-right">Close price</TableHead>
            <TableHead className="text-right">Held</TableHead>
            <TableHead>Closed by</TableHead>
            <TableHead className="pr-5 text-right">Net P&L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => (
            <TableRow key={t.ticket}>
              <TableCell className="pl-5 text-muted-foreground">{formatDateTime(t.open, tz)}</TableCell>
              <TableCell className="font-medium">{t.symbol}</TableCell>
              <TableCell>
                <Badge variant="outline" className={cn("capitalize", t.side === "buy" ? "text-profit" : "text-loss")}>{t.side}</Badge>
              </TableCell>
              <TableCell className={num}>{t.lots}</TableCell>
              <TableCell className={num}>{+t.openPrice.toFixed(3)}</TableCell>
              <TableCell className={num}>{+t.closePrice.toFixed(3)}</TableCell>
              <TableCell className={num}>{duration(t.durationMin)}</TableCell>
              <TableCell className="text-muted-foreground">{reasonLabel(t.reason)}</TableCell>
              <TableCell className={cn("pr-5", num, pnlClass(t.net))}>{money(t.net, true)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between border-t px-5 py-3 text-sm text-muted-foreground">
        <span>{plural(sorted.length, "trade")}</span>
        <div className="flex items-center gap-2">
          <span>Page {p + 1} of {pages}</span>
          <Button variant="outline" size="icon" className="size-8" disabled={p === 0} onClick={() => setPage(p - 1)} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" className="size-8" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
