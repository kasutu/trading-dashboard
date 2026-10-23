import type * as React from "react"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useCashFlows } from "@/hooks/use-api"
import { CashFlowForm } from "./cash-flow-form"
import { CashFlowList } from "./cash-flow-list"

type Props = { accountId: string; tz: string; children: React.ReactNode }

/** Add, see and delete the deposits, withdrawals and adjustments of an account. `children` opens it. */
export function CashFlowDialog({ accountId, tz, children }: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent size="full" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold">Deposits and withdrawals</DialogTitle>
          <DialogDescription>
            Add what your imports do not have (a CSV file has no deposits or withdrawals; an MT5 report brings them). They are kept apart from your trading P&L.
          </DialogDescription>
        </DialogHeader>
        {/* One column no wider than the dialog, so the selection bar wraps instead of widening it */}
        <DialogBody className="grid-cols-[minmax(0,1fr)]">
          <CashFlowForm accountId={accountId} />
          <Entries accountId={accountId} tz={tz} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

/** Mounted only while the dialog is open, so the list loads on open. */
function Entries({ accountId, tz }: { accountId: string; tz: string }) {
  const { data, error } = useCashFlows(accountId, tz)
  return (
    <section className="space-y-1 border-t pt-4">
      <h3 className="text-sm font-semibold">Entries</h3>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {data ? (
        <CashFlowList accountId={accountId} rows={data.rows} tz={tz} />
      ) : (
        !error && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      )}
    </section>
  )
}
