import * as React from "react"
import { ArrowDownLeft, ArrowUpRight, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cashFlowsPath, invalidate } from "@/hooks/use-api"
import { api } from "@/lib/api/client"
import type { LocalCashFlow } from "@/lib/api/types"
import { formatDateTime, money } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Deposits and withdrawals, newest first, each with a delete button. */
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
          const deposit = f.kind === "deposit"
          const Icon = deposit ? ArrowDownLeft : ArrowUpRight
          return (
            <li key={f.id} className="flex items-center gap-3 py-2.5">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full",
                  deposit ? "bg-deposit/12 text-deposit" : "bg-withdrawal/12 text-withdrawal"
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{deposit ? "Deposit" : "Withdrawal"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[formatDateTime(f.occurredAt, tz), f.note].filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="font-mono text-sm font-medium whitespace-nowrap">
                {deposit ? "+" : "−"}{money(f.amount)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                disabled={busy === f.id}
                onClick={() => remove(f.id)}
                aria-label={`Delete ${deposit ? "deposit" : "withdrawal"} of ${money(f.amount)}`}
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
