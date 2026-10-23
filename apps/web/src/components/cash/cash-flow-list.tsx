import * as React from "react"
import { ArrowDownLeft, ArrowUpRight, Scale, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cashFlowsPath, invalidate } from "@/hooks/use-api"
import { api } from "@/lib/api/client"
import type { LocalCashFlow } from "@/lib/api/types"
import { FLOW_LABELS, formatDateTime, money } from "@/lib/format"
import { cn } from "@/lib/utils"

const ICONS = { deposit: ArrowDownLeft, withdrawal: ArrowUpRight, adjustment: Scale }
const TONES = {
  deposit: "bg-deposit/12 text-deposit",
  withdrawal: "bg-withdrawal/12 text-withdrawal",
  adjustment: "bg-adjustment/12 text-adjustment",
}

/** Deposits, withdrawals and adjustments, newest first, each with a delete button. */
export function CashFlowList({ accountId, rows, tz }: { accountId: string; rows: LocalCashFlow[]; tz: string }) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const remove = async (id: string) => {
    setBusy(id)
    setError(null)
    try {
      await api(`${cashFlowsPath(accountId)}/${id}`, { method: "DELETE" })
      invalidate(cashFlowsPath(accountId))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (!rows.length)
    return <p className="py-6 text-center text-sm text-muted-foreground">No deposits or withdrawals yet.</p>

  return (
    <div className="space-y-2">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <ul className="divide-y">
        {rows.map((f) => {
          const Icon = ICONS[f.kind]
          const label = FLOW_LABELS[f.kind]
          return (
            <li key={f.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span
                className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", TONES[f.kind])}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[formatDateTime(f.occurredAt, tz), f.note].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="font-mono text-sm whitespace-nowrap tabular-nums">
                {f.kind === "withdrawal" ? "−" : "+"}{money(f.amount)}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-mr-2 shrink-0 text-muted-foreground hover:text-destructive sm:mr-0"
                disabled={busy === f.id}
                onClick={() => remove(f.id)}
                aria-label={`Delete ${label.toLowerCase()} of ${money(f.amount)}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
