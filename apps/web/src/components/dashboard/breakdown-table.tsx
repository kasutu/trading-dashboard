import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useNarrow } from "@/hooks/use-media"
import { money, pct, plural, pnlClass } from "@/lib/format"
import type { Group } from "@/lib/api/types"
import { cn } from "@/lib/utils"

/** Trades, win rate and net P&L for each group. A table from md, a list on phones. */
export function BreakdownTable({ rows, label, className }: { rows: Group[]; label: string; className?: string }) {
  const narrow = useNarrow()
  if (narrow) return <BreakdownList rows={rows} label={label} className={className} />
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8 px-0 text-xs font-normal text-muted-foreground">{label}</TableHead>
          <TableHead className="h-8 text-right text-xs font-normal text-muted-foreground">Trades</TableHead>
          <TableHead className="h-8 text-right text-xs font-normal text-muted-foreground">Win rate</TableHead>
          <TableHead className="h-8 pr-0 text-right text-xs font-normal text-muted-foreground">Net P&L</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="px-0 py-2.5">{r.key}</TableCell>
            <TableCell className="py-2.5 text-right font-mono text-muted-foreground tabular-nums">{r.trades}</TableCell>
            <TableCell className="py-2.5 text-right font-mono text-muted-foreground tabular-nums">{pct(r.winRate)}</TableCell>
            <TableCell className={cn("py-2.5 pr-0 text-right font-mono tabular-nums", pnlClass(r.net))}>{money(r.net, true)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** Phones: one row per group, the net P&L on the right and the counts in a muted line. */
function BreakdownList({ rows, label, className }: { rows: Group[]; label: string; className?: string }) {
  return (
    <ul aria-label={label} className={cn("divide-y", className)}>
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{r.key}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{plural(r.trades, "trade")} · {pct(r.winRate)} won</p>
          </div>
          <span className={cn("font-mono text-sm tabular-nums", pnlClass(r.net))}>{money(r.net, true)}</span>
        </li>
      ))}
    </ul>
  )
}
