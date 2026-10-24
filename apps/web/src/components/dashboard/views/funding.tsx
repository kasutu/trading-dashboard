import type * as React from "react"
import { Plus } from "lucide-react"
import { CashFlowDialog } from "@/components/cash/cash-flow-dialog"
import { CashFlowList } from "@/components/cash/cash-flow-list"
import { CashFlowChart } from "@/components/charts/cash-flow-chart"
import { Panel } from "@/components/dashboard/panel"
import { Button } from "@/components/ui/button"
import type { AccountRisk, CashFlows } from "@/lib/api/types"
import { formatPeriod, money, plural, pnlClass, transfers } from "@/lib/format"
import { DEFAULT_RISK, limits } from "@/lib/risk"

/** Deposits and withdrawals: net deposited with a timeline, then the entries. Broker adjustments show apart.
 *  All time; the trade filters do not apply. */
/** `balance`: null while it loads or with no deposits. `risk`: the account's limits. */
export function Funding({ accountId, flows, tz, balance, risk }: { accountId: string; flows: CashFlows | undefined; tz: string; balance: number | null; risk: AccountRisk | null }) {
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
          Import an MT5 report to bring them in, or add them by hand. They show here, so a jump in your balance is not mistaken for trading profit.
        </p>
        <div className="mt-4">{add}</div>
      </div>
    )

  return (
    <div className="grid grid-cols-1 gap-4">
      {balance !== null && <Balance s={s} balance={balance} risk={risk} />}
      <Panel
        title="Funding"
        metric={{
          // Money moved in or out, not profit or loss: no green or red.
          value: money(s.net),
          label: "Net deposited (deposits minus withdrawals)",
          stats: [
            [<Swatch key="d" className="bg-deposit" label="Deposits" />, `${money(s.deposits.total)} in ${plural(s.deposits.count, "deposit")}`],
            [<Swatch key="w" className="bg-withdrawal" label="Withdrawals" />, `${money(s.withdrawals.total)} in ${plural(s.withdrawals.count, "withdrawal")}`],
            // Moves between your own wallet and accounts at the broker, already inside the totals above.
            ...(s.transfersIn.count || s.transfersOut.count
              ? [["Of which internal", transfers(s)] as [React.ReactNode, React.ReactNode]]
              : []),
            // Broker adjustments are not money you sent, so they stay out of net deposited.
            ...(s.adjustments.count
              ? [[<Swatch key="a" className="bg-adjustment" label="Adjustments" />, `${money(s.adjustments.total)} in ${plural(s.adjustments.count, "adjustment")}`] as [React.ReactNode, React.ReactNode]]
              : []),
          ],
        }}
        description={`${formatPeriod([daily[0].day, daily.at(-1)!.day])}, all time, not filtered.`}
      >
        <CashFlowChart daily={daily} rows={rows} />
      </Panel>
      <Panel title={`Entries (${rows.length})`} action={add} share={false}>
        <CashFlowList accountId={accountId} rows={rows} tz={tz} />
      </Panel>
    </div>
  )
}

/** What is left in the account, with the parts that add up to it and the account's daily max loss. */
function Balance({ s, balance, risk }: { s: CashFlows["summary"]; balance: number; risk: AccountRisk | null }) {
  const tradingNet = balance - s.net - s.adjustments.total
  const maxLoss = limits(risk ?? DEFAULT_RISK, balance, null).daily
  return (
    <Panel
      title="Balance"
      metric={{
        // Money in the account, not a gain or loss: neutral unless below zero.
        value: money(balance),
        tone: balance < 0 ? "loss" : undefined,
        label: "All time",
        stats: [
          ["Net deposited", money(s.net)],
          ["Trading P&L", <span key="p" className={pnlClass(tradingNet)}>{money(tradingNet, true)}</span>],
          ...(s.adjustments.count ? [["Adjustments", money(s.adjustments.total, true)] as [React.ReactNode, React.ReactNode]] : []),
          ...(maxLoss !== null ? [["Max loss", money(maxLoss)] as [React.ReactNode, React.ReactNode]] : []),
        ],
      }}
      description="Excludes open trades and missing imports."
    />
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
