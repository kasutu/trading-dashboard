import { Plus } from "lucide-react"
import { CashFlowDialog } from "@/components/cash/cash-flow-dialog"
import { CashFlowList } from "@/components/cash/cash-flow-list"
import { CashFlowChart } from "@/components/charts/cash-flow-chart"
import { Panel } from "@/components/dashboard/panel"
import { Button } from "@/components/ui/button"
import type { CashFlows } from "@/lib/api/types"
import { formatPeriod, money, plural } from "@/lib/format"

/** Deposits and withdrawals: net deposited with a timeline, then the entries. All time; the trade filters do not apply. */
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
    <div className="grid grid-cols-1 gap-4">
      <Panel
        title="Funding"
        metric={{
          // Money moved in or out, not profit or loss: no green or red.
          value: money(s.net),
          label: "Net deposited · deposits minus withdrawals",
          stats: [
            [<Swatch key="d" className="bg-deposit" label="Deposits" />, `${money(s.deposits.total)} · ${plural(s.deposits.count, "deposit")}`],
            [<Swatch key="w" className="bg-withdrawal" label="Withdrawals" />, `${money(s.withdrawals.total)} · ${plural(s.withdrawals.count, "withdrawal")}`],
          ],
        }}
        description={`${formatPeriod([daily[0].day, daily.at(-1)!.day])} · all time, not filtered.`}
      >
        <CashFlowChart daily={daily} rows={rows} />
      </Panel>
      <Panel title={`Entries · ${rows.length}`} action={add} share={false}>
        <CashFlowList accountId={accountId} rows={rows} tz={tz} />
      </Panel>
    </div>
  )
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`size-2 rounded-[2px] ${className}`} />
      {label}
    </span>
  )
}
