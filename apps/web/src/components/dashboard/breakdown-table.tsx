import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { money, pct, pnlClass } from "@/lib/format"
import type { Group } from "@/lib/trades"
import { cn } from "@/lib/utils"

/** Trades, win rate and net P&L for each group. */
export function BreakdownTable({ rows, label, className }: { rows: Group[]; label: string; className?: string }) {
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          <TableHead className="h-8 px-0">{label}</TableHead>
          <TableHead className="h-8 text-right">Trades</TableHead>
          <TableHead className="h-8 text-right">Win rate</TableHead>
          <TableHead className="h-8 pr-0 text-right">Net P&L</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="px-0 py-2 font-medium">{r.key}</TableCell>
            <TableCell className="py-2 text-right font-mono tabular-nums">{r.trades}</TableCell>
            <TableCell className="py-2 text-right font-mono tabular-nums">{pct(r.winRate)}</TableCell>
            <TableCell className={cn("py-2 pr-0 text-right font-mono tabular-nums", pnlClass(r.net))}>{money(r.net, true)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
