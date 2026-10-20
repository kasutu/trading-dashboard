import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cashFlowsPath, invalidate } from "@/hooks/use-api"
import { api } from "@/lib/api/client"
import type { CashFlow, FlowKind } from "@/lib/api/types"

/** The browser's local time now, in the format of a datetime-local input. */
function nowLocal() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset(), 0, 0)
  return d.toISOString().slice(0, 16)
}

const kindItem =
  "h-8 flex-1 rounded-full px-3 text-[13px] text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:bg-popover"

/** Adds a deposit or withdrawal. The time is read in the browser's timezone. */
export function CashFlowForm({ accountId, onAdded }: { accountId: string; onAdded?: (f: CashFlow) => void }) {
  const [kind, setKind] = React.useState<FlowKind>("deposit")
  const [when, setWhen] = React.useState(nowLocal)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const note = String(data.get("note")).trim()
    setBusy(true)
    setError(null)
    try {
      const flow = await api<CashFlow>(cashFlowsPath(accountId), {
        method: "POST",
        body: {
          occurredAt: new Date(when).toISOString(),
          kind,
          amount: Number(data.get("amount")),
          note: note || undefined,
        },
      })
      invalidate(cashFlowsPath(accountId))
      form.reset()
      setWhen(nowLocal())
      onAdded?.(flow)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ToggleGroup
        type="single"
        spacing={1}
        className="w-full rounded-full bg-muted p-0.5"
        value={kind}
        onValueChange={(v) => v && setKind(v as FlowKind)}
        aria-label="Deposit or withdrawal"
      >
        <ToggleGroupItem value="deposit" className={kindItem}>Deposit</ToggleGroupItem>
        <ToggleGroupItem value="withdrawal" className={kindItem}>Withdrawal</ToggleGroupItem>
      </ToggleGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="flow-amount">Amount</Label>
          <Input id="flow-amount" name="amount" type="number" inputMode="decimal" min="0.01" step="0.01" required placeholder="0.00" className="font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="flow-when">Date and time</Label>
          <Input id="flow-when" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} className="font-mono" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="flow-note">Note <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id="flow-note" name="note" maxLength={200} placeholder="For example: Bank transfer" />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? "Adding…" : kind === "deposit" ? "Add deposit" : "Add withdrawal"}</Button>
      </div>
    </form>
  )
}
