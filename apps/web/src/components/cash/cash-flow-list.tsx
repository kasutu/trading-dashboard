import * as React from "react"
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Scale, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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

type BulkAction = "delete" | "markInternal" | "markExternal"

/** Deposits, withdrawals and adjustments, newest first. Each has a delete button; tick several to
 *  delete them or mark them internal or external at once. */
export function CashFlowList({ accountId, rows, tz }: { accountId: string; rows: LocalCashFlow[]; tz: string }) {
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set())
  const [busy, setBusy] = React.useState<string | null>(null)
  const [confirming, setConfirming] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Entries deleted elsewhere drop out of the selection.
  const selected = rows.filter((f) => picked.has(f.id))
  const all = rows.length > 0 && selected.length === rows.length
  // Adjustments are never internal, so marking needs a deposit or withdrawal in the selection.
  const markable = selected.filter((f) => f.kind !== "adjustment")

  const toggle = (id: string, on: boolean) =>
    setPicked((p) => {
      const n = new Set(p)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
  const clear = () => {
    setPicked(new Set())
    setConfirming(false)
  }

  const run = async (key: string, request: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await request()
      invalidate(cashFlowsPath(accountId))
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      setBusy(null)
    }
  }
  const remove = (id: string) => run(id, () => api(`${cashFlowsPath(accountId)}/${id}`, { method: "DELETE" }))
  const bulk = async (action: BulkAction) => {
    const ids = (action === "delete" ? selected : markable).map((f) => f.id)
    const ok = await run(action, () => api(`${cashFlowsPath(accountId)}/bulk`, { method: "POST", body: { ids, action } }))
    if (ok && action === "delete") clear()
    else setConfirming(false)
  }

  if (!rows.length)
    return <p className="py-6 text-center text-sm text-muted-foreground">No deposits or withdrawals yet.</p>

  return (
    <div className="space-y-2">
      {/* Select all, and the actions once something is ticked */}
      <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-2 border-b pb-2">
        <Checkbox
          checked={all ? true : selected.length ? "indeterminate" : false}
          onCheckedChange={(v) => (v === true && !all ? setPicked(new Set(rows.map((f) => f.id))) : clear())}
          aria-label={all ? "Clear the selection" : "Select all entries"}
          className="ml-2"
        />
        <span className="text-sm text-muted-foreground">{selected.length ? `${selected.length} selected` : "Select all"}</span>
        {selected.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {confirming ? (
              <>
                <span className="text-sm">Delete {selected.length === 1 ? "1 entry" : `${selected.length} entries`}?</span>
                <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => bulk("delete")}>
                  Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" disabled={busy !== null || !markable.length} onClick={() => bulk("markInternal")}>
                  <ArrowLeftRight /> Internal
                </Button>
                <Button size="sm" variant="outline" disabled={busy !== null || !markable.length} onClick={() => bulk("markExternal")}>
                  External
                </Button>
                <Button size="sm" variant="outline" className="text-destructive" disabled={busy !== null} onClick={() => setConfirming(true)}>
                  <Trash2 /> Delete
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={clear} aria-label="Clear the selection">
                  <X />
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <ul className="divide-y">
        {rows.map((f) => {
          const Icon = ICONS[f.kind]
          const label = f.internal ? (f.kind === "deposit" ? "Transfer in" : "Transfer out") : FLOW_LABELS[f.kind]
          const on = picked.has(f.id)
          return (
            <li key={f.id} className={cn("flex items-center gap-3 py-2.5 last:pb-0", on && "bg-muted/40")}>
              <Checkbox checked={on} onCheckedChange={(v) => toggle(f.id, v === true)} aria-label={`Select ${label.toLowerCase()} of ${money(f.amount)}`} className="ml-2" />
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", TONES[f.kind])}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {label}
                  {f.internal && <span className="font-normal text-muted-foreground"> (internal)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[formatDateTime(f.occurredAt, tz), f.note].filter(Boolean).join(", ")}
                </p>
              </div>
              <span className="font-mono text-sm whitespace-nowrap tabular-nums">
                {f.kind === "withdrawal" ? "−" : "+"}
                {money(f.amount)}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-mr-2 shrink-0 text-muted-foreground hover:text-destructive sm:mr-0"
                disabled={busy !== null}
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
