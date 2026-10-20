import type * as React from "react"
import { Plus } from "lucide-react"
import { CashFlowDialog } from "@/components/cash/cash-flow-dialog"
import { CashFlowList } from "@/components/cash/cash-flow-list"
import { CashFlowChart } from "@/components/charts/cash-flow-chart"
import { Panel } from "@/components/dashboard/panel"
import { Button } from "@/components/ui/button"
import type { CashFlows } from "@/lib/api/types"
import { formatPeriod, money, plural } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Deposits and withdrawals: totals, a timeline and the entries. All time; the trade filters do not apply. */
export function Funding({ accountId, flows, tz }: { accountId: string; flows: CashFlows | undefined; tz: string }) {
  if (!flows) return <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
  const { summary: s, daily, rows } = flows
  const add = (
    <CashFlowDialog accountId={accountId} tz={tz}>
      <Button size="sm" variant="outline"><Plus /> Add</Button>
    </CashFlowDialog>
  )

  if (!rows.length)
    return (
      <div className="rounded-xl border border-dashed bg-card px-5 py-16 text-center">
        <p className="font-medium">No deposits or withdrawals yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Your trade file has none, so add them by hand. They show here and on the equity curve, so a jump in your balance is not mistaken for trading profit.
        </p>
        <div className="mt-4">{add}</div>
      </div>
    )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <dl className="grid grid-cols-1 overflow-hidden rounded-xl border bg-card shadow-card sm:grid-cols-3 [&>div]:border-b [&>div]:border-r [&>div]:-mb-px [&>div]:-mr-px">
        <Tile label="Deposits" value={money(s.deposits.total)} sub={plural(s.deposits.count, "deposit")} swatch="bg-deposit" />
        <Tile label="Withdrawals" value={money(s.withdrawals.total)} sub={plural(s.withdrawals.count, "withdrawal")} swatch="bg-withdrawal" />
        <Tile label="Net deposited" value={money(s.net)} sub="Deposits minus withdrawals" swatch="bg-chart-1" />
      </dl>
      <Panel
        title="Deposits and withdrawals over time"
        description={`${formatPeriod([daily[0].day, daily.at(-1)!.day])} · all time, not filtered`}
      >
        <CashFlowChart daily={daily} rows={rows} />
      </Panel>
      <section className="rounded-xl border bg-card p-5 shadow-card">
        <header className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Entries</h3>
          {add}
        </header>
        <div className="mt-2">
          <CashFlowList accountId={accountId} rows={rows} tz={tz} />
        </div>
      </section>
    </div>
  )
}

function Tile({ label, value, sub, swatch }: { label: string; value: React.ReactNode; sub: string; swatch: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn("size-2 rounded-[2px]", swatch)} />
        {label}
      </dt>
      <dd className="mt-1 font-mono text-lg font-medium whitespace-nowrap tabular-nums">{value}</dd>
      <dd className="mt-0.5 text-xs text-muted-foreground">{sub}</dd>
    </div>
  )
}
