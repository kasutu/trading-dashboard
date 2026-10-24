import * as React from "react"
import { pillGroup, pillItem } from "@/components/dashboard/filter-bar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { invalidate } from "@/hooks/use-api"
import { api } from "@/lib/api/client"
import type { Account, AccountRisk } from "@/lib/api/types"
import { DEFAULT_RISK } from "@/lib/risk"

/** The account's configuration: max loss a day and risk per trade (% of balance or dollars), and weekend trading.
 *  An empty field means no limit. Trades a day come from the best cap on Frequency. */
export function ConfigDialog({ account, children }: { account: Account; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const risk = account.risk ?? DEFAULT_RISK
  const [kind, setKind] = React.useState(risk.kind)
  const [weekends, setWeekends] = React.useState(!!risk.weekends)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const unit = kind === "percent" ? "%" : "$"

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const num = (k: string) => (String(form.get(k)).trim() === "" ? null : Number(form.get(k)))
    const next: AccountRisk = { kind, daily: num("daily"), perTrade: num("perTrade"), maxTrades: null, weekends }
    setBusy(true)
    setError(null)
    try {
      await api(`/accounts/${account.id}`, { method: "PATCH", body: { risk: next } })
      invalidate("/accounts")
      setOpen(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        setKind(risk.kind)
        setWeekends(!!risk.weekends)
        setError(null)
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-1 pr-10 sm:pr-6">
            <DialogTitle className="font-display text-lg font-bold">Configuration</DialogTitle>
            <DialogDescription>For {account.name}. A blank limit means none.</DialogDescription>
          </div>
          <div className="space-y-1.5">
            <Label id="risk-kind">Set risk as</Label>
            <ToggleGroup
              type="single"
              spacing={1}
              className={pillGroup}
              value={kind}
              onValueChange={(v) => v && setKind(v as AccountRisk["kind"])}
              aria-labelledby="risk-kind"
            >
              <ToggleGroupItem value="percent" className={pillItem}>Percent</ToggleGroupItem>
              <ToggleGroupItem value="amount" className={pillItem}>Dollars</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <Field id="daily" label="Max loss" unit={unit} value={risk.daily} max={kind === "percent" ? 100 : undefined} />
          <Field id="perTrade" label="Per trade" unit={unit} value={risk.perTrade} max={kind === "percent" ? 100 : undefined} />
          <p className="text-sm text-muted-foreground">Trades a day come from your best cap on Frequency.</p>
          <div className="flex items-center justify-between gap-4 border-t pt-4">
            <Label htmlFor="config-weekends" className="font-normal">Trade on weekends</Label>
            <Switch id="config-weekends" checked={weekends} onCheckedChange={setWeekends} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** A number field with its unit inside, on the right. */
function Field({ id, label, unit, value, max, step }: { id: string; label: string; unit?: string; value: number | null; max?: number; step?: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={`risk-${id}`} className="font-normal">{label}</Label>
      <div className="relative w-32 flex-none">
        <Input
          id={`risk-${id}`}
          name={id}
          type="number"
          inputMode={step === 1 ? "numeric" : "decimal"}
          min={step === 1 ? 1 : 0.01}
          max={max}
          step={step ?? "any"}
          defaultValue={value ?? ""}
          placeholder="None"
          className={unit ? "pr-8 text-right tabular-nums" : "text-right tabular-nums"}
        />
        {unit && <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{unit}</span>}
      </div>
    </div>
  )
}
