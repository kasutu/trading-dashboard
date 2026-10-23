import { PnlBars } from "@/components/charts/pnl-bars"
import { BreakdownTable } from "@/components/dashboard/breakdown-table"
import { LockedPanel } from "@/components/dashboard/locked-panel"
import { bestMetric } from "@/components/dashboard/metrics"
import { Panel, type Metric } from "@/components/dashboard/panel"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useNarrow } from "@/hooks/use-media"
import type { Analytics, BestLots, FullAnalytics, Group } from "@/lib/api/types"
import { money, pct, plural, pnlClass, sizeLabel } from "@/lib/format"
import { best } from "@/lib/utils"

export function Risk({ a }: { a: Analytics }) {
  const { byLots: lots, byReason: reasons } = a

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="grid min-w-0 grid-cols-1 content-start gap-4">
        <Panel title="P&L by position size" metric={bestMetric(lots, "size", sizeLabel)} description="Lots per trade, for each symbol.">
          <PnlBars data={lots} vertical height={Math.max(180, lots.length * 30 + 40)} title={(d) => sizeLabel(d.key)} />
        </Panel>
        <Panel title="Best lots per instrument" metric={bestLotsMetric(a.bestLots)} description="Sizes with at least 5 trades on the symbol.">
          <BestLotsTable rows={a.bestLots} />
        </Panel>
      </div>
      <Panel title="How trades closed" metric={reasonMetric(reasons)} description="Stop loss, take profit, manual or margin stop-out.">
        <PnlBars data={reasons} vertical height={180} />
        <BreakdownTable label="Closed by" rows={reasons} className="mt-4" />
      </Panel>
      {a.locked ? (
        <LockedPanel
          title="Loss limits and trades after a loss"
          items={["The daily loss limit that kept the most money", "How trades opened right after a loss did"]}
          className="lg:col-span-2"
        />
      ) : (
        <Simulations a={a} />
      )}
    </div>
  )
}

/** The size that made the most on any symbol. Not a P&L, so it stays plain. */
function bestLotsMetric(rows: BestLots[]): Metric | undefined {
  const top = rows.filter((r) => r.best).reduce<BestLots | undefined>((b, r) => (!b || r.best!.net > b.best!.net ? r : b), undefined)
  if (!top?.best) return undefined
  return { value: `${top.best.key} lots`, label: `Best size · ${top.symbol}, ${money(top.best.net, true)}, ${pct(top.best.winRate)} won` }
}

/** How most trades closed. */
function reasonMetric(rows: Group[]): Metric | undefined {
  const all = rows.reduce((s, r) => s + r.trades, 0)
  const top = rows.reduce<Group | undefined>((b, r) => (!b || r.trades > b.trades ? r : b), undefined)
  if (!top || !all) return undefined
  return { value: pct(top.trades / all), label: `Closed by ${top.key.toLowerCase()} · ${plural(top.trades, "trade")}`, stats: [["Net P&L", money(top.net, true)]] }
}

/** Paid part of the Risk tab. */
function Simulations({ a }: { a: FullAnalytics }) {
  const { lossLimitSim: limits, afterLoss: al } = a
  const top = best(limits)
  const actual = a.summary.net
  return (
    <>
      {top && (
        <Panel
          title="Daily loss limit"
          metric={{
            value: money(top.net, true),
            tone: top.net,
            label: `Best limit · stop at −$${top.limit} a day`,
            stats: [["Actual", money(actual, true)], ["Change", money(top.net - actual, true)]],
          }}
          description="Net P&L if you stop for the day after a loss of $X."
          className="lg:col-span-2"
        >
          <PnlBars
            data={limits}
            highlight={(d) => d.limit === top.limit}
            title={(d) => `Stop at −$${d.limit} a day`}
            rows={(d) => [
              ["Net P&L", money(d.net, true), pnlClass(d.net)],
              ["Change", money(d.net - actual, true), pnlClass(d.net - actual)],
              ["Days stopped early", d.stoppedDays],
              ["Trades kept", d.trades],
            ]}
            height={240}
          />
        </Panel>
      )}
      <Panel
        title="Trades after a loss"
        metric={{
          value: money(al.after.net, true),
          tone: al.after.net,
          label: `Right after a loss · ${plural(al.after.trades, "trade")}, ${pct(al.after.winRate)} won, ${money(al.after.avg, true)} each`,
          stats: [
            ["All other trades", money(al.other.net, true)],
            ["Their win rate", pct(al.other.winRate)],
            ["Per trade", money(al.other.avg, true)],
          ],
        }}
        description={`Trades opened within ${al.windowMin} minutes after a losing trade closed.`}
        className="lg:col-span-2"
      />
    </>
  )
}

/** The best and worst lot size on each symbol. A table from md, a list on phones. */
function BestLotsTable({ rows }: { rows: BestLots[] }) {
  const narrow = useNarrow()
  const none = <span className="text-muted-foreground">Not enough trades</span>
  const bestOf = (r: BestLots) => (r.best ? <LotStat g={r.best} rate /> : r.sizes ? <span className="text-muted-foreground">No winning size</span> : none)
  const worstOf = (r: BestLots) => (r.worst ? <LotStat g={r.worst} /> : r.sizes ? <span className="text-muted-foreground">No losing size</span> : none)
  if (narrow)
    return (
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.symbol} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-3 text-sm first:pt-0 last:pb-0">
            <span className="truncate">{r.symbol}</span>
            <span className="text-right">{bestOf(r)}</span>
            <span className="col-span-2 flex justify-between gap-3 text-xs text-muted-foreground">
              Worst size <span className="text-right">{worstOf(r)}</span>
            </span>
          </li>
        ))}
      </ul>
    )
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8 px-0 text-xs font-normal text-muted-foreground">Symbol</TableHead>
          <TableHead className="h-8 text-xs font-normal text-muted-foreground">Best size</TableHead>
          <TableHead className="h-8 pr-0 text-xs font-normal text-muted-foreground">Worst size</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.symbol}>
            <TableCell className="px-0 py-2.5">{r.symbol}</TableCell>
            <TableCell className="py-2.5">{bestOf(r)}</TableCell>
            <TableCell className="py-2.5 pr-0">{worstOf(r)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** "0.02 lots", then "+$120.50 · 62%" below. */
function LotStat({ g, rate }: { g: Group; rate?: boolean }) {
  return (
    <div className="font-mono tabular-nums">
      <div>{g.key} lots</div>
      <div className="text-xs">
        <span className={pnlClass(g.net)}>{money(g.net, true)}</span>
        {rate && <span className="text-muted-foreground"> · {pct(g.winRate)} win</span>}
      </div>
    </div>
  )
}
