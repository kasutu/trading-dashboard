import type * as React from "react"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useCashFlows } from "@/hooks/use-api"
import { CashFlowForm } from "./cash-flow-form"
import { CashFlowList } from "./cash-flow-list"

type Props = { accountId: string; tz: string; children: React.ReactNode }

/** Add, see and delete the deposits and withdrawals of an account. `children` opens it. */
export function CashFlowDialog({ accountId, tz, children }: Props) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent size="full" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold">Deposits and withdrawals</DialogTitle>
          <DialogDescription>
            Your trade file has no deposits or withdrawals, so add them here. They are kept apart from your trading P&L.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
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
