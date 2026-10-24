import * as React from "react"
import { CircleAlert, CircleCheck, FileText } from "lucide-react"
import { Link } from "wouter"
import { MetricBlock } from "@/components/dashboard/panel"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { invalidate } from "@/hooks/use-api"
import { api } from "@/lib/api/client"
import type { Mt5ImportResult } from "@/lib/api/types"
import { LOCAL_TZ, formatDateTime, formatPeriod, money, plural, transfers, tzLabel } from "@/lib/format"
import { SERVER_TIMEZONES, isExness } from "@/lib/mt5"

export type ReportFile = { name: string; text: string }

type Props = { file: ReportFile; accountId: string; onReset: () => void }

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: LOCAL_TZ })

/** Preview of an MT5 report (a dry run on the server), the server timezone, then the import and its result. */
export function Mt5Import({ file, accountId, onReset }: Props) {
  const [preview, setPreview] = React.useState<Mt5ImportResult | null>(null)
  const [result, setResult] = React.useState<Mt5ImportResult | null>(null)
  // null until known: Exness is UTC; for other brokers the person picks it.
  const [tz, setTz] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const send = React.useCallback(
    (serverTz: string, dryRun: boolean) =>
      api<Mt5ImportResult>(`/accounts/${accountId}/imports`, {
        method: "POST",
        body: { fileName: file.name, format: "mt5", report: file.text, serverTz, dryRun },
      }),
    [accountId, file]
  )

  // The counts do not depend on the timezone, so one dry run in UTC fills the preview.
  React.useEffect(() => {
    let live = true
    send("UTC", true)
      .then((r) => {
        if (!live) return
        setPreview(r)
        if (isExness(r.account)) setTz("UTC")
      })
      .catch((e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [send])

  const submit = async () => {
    if (!tz) return
    setBusy(true)
    setError(null)
    try {
      const r = await send(tz, false)
      invalidate("/accounts")
      setResult(r)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
      <Button type="button" variant="ghost" size="sm" className="-mr-2" onClick={onReset}>
        {result ? "Import another file" : "Choose another file"}
      </Button>
    </div>
  )

  if (result) return <Mt5Result r={result} header={header} />

  const p = preview
  const exness = p ? isExness(p.account) : false
  const flowsToAdd = p?.cashFlows.added ?? 0
  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 shadow-card sm:p-6">
      {header}
      {!p && !error && <p className="text-sm text-muted-foreground">Reading the report…</p>}
      {p && (
        <>
          <div className="-mt-1">
            <p className="text-sm font-semibold">MetaTrader 5 report</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
              <span>Account <span className="font-mono tabular-nums text-foreground">{p.account.login}</span></span>
              {p.account.server && <span>{p.account.server}</span>}
              {p.account.kind && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize text-foreground">{p.account.kind}</span>
              )}
            </p>
          </div>
          <MetricBlock
            metric={{
              value: p.trades.added,
              label: [
                p.trades.added === 1 ? "position to import" : "positions to import",
                p.trades.duplicates > 0 && `${p.trades.duplicates} already stored`,
                p.from && p.to && formatPeriod([dayOf(p.from), dayOf(p.to)]),
              ].filter(Boolean).join(", "),
              stats: flowStats(p),
            }}
          />
          {p.trades.added === 0 && flowsToAdd === 0 && (
            <p className="text-sm text-muted-foreground">Everything in this report is already stored. Importing it again adds nothing.</p>
          )}
          <div className="grid gap-1.5 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-center sm:gap-4">
            <Label htmlFor="server-tz" className="flex flex-col items-start gap-0.5 font-normal">
              Server timezone
              <span className="text-xs text-muted-foreground">
                {exness
                  ? "Exness servers run on UTC."
                  : "The report shows your broker's server time. Most MT5 brokers run on UTC+2 in winter and UTC+3 in summer (pick Athens). Ask your broker if unsure."}
              </span>
            </Label>
            <Select value={tz ?? ""} onValueChange={setTz}>
              <SelectTrigger id="server-tz" className="w-full bg-card" aria-invalid={!tz}>
                <SelectValue placeholder="Pick the server timezone" />
              </SelectTrigger>
              <SelectContent>
                {SERVER_TIMEZONES.map((z) => <SelectItem key={z} value={z}>{tzLabel(z)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      {p && (
        <div className="flex justify-end">
          <Button className="w-full sm:w-auto" disabled={!tz || busy} onClick={submit}>
            {busy ? "Importing…" : p.trades.added > 0 ? `Import ${plural(p.trades.added, "position")}` : "Import"}
          </Button>
        </div>
      )}
    </section>
  )
}

/** Deposits, withdrawals, adjustments and the deals left out, as quiet stats. */
function flowStats(p: Mt5ImportResult): [string, string][] {
  const s = p.cashFlows.summary
  const stats: [string, string][] = [
    ["Deposits", `${money(s.deposits.total)} (${s.deposits.count})`],
    ["Withdrawals", `${money(s.withdrawals.total)} (${s.withdrawals.count})`],
  ]
  if (s.transfersIn.count || s.transfersOut.count) stats.push(["Of which internal", transfers(s)])
  if (s.adjustments.count) stats.push(["Adjustments", `${money(s.adjustments.total)} (${s.adjustments.count})`])
  const skipped = skippedText(p.skippedDeals)
  if (skipped) stats.push(["Not imported", skipped])
  return stats
}

/** { credit: 1, bonus: 2 } → "1 credit, 2 bonus deals" */
function skippedText(deals: Record<string, number>) {
  const parts = Object.entries(deals).map(([type, n]) => `${n} ${type}`)
  if (!parts.length) return ""
  const total = Object.values(deals).reduce((a, b) => a + b, 0)
  return `${parts.join(", ")} ${total === 1 ? "deal" : "deals"}`
}

function Mt5Result({ r, header }: { r: Mt5ImportResult; header: React.ReactNode }) {
  const dups = r.cashFlows.possibleManualDuplicates
  const skipped = skippedText(r.skippedDeals)
  return (
    <section className="space-y-5 rounded-xl border bg-card p-5 shadow-card sm:p-6">
      {header}
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <CircleCheck className="size-4 text-profit" /> Import done
        </p>
        <MetricBlock
          className="mt-1"
          metric={{
            value: r.trades.added,
            label: [
              r.trades.added === 1 ? "position added" : "positions added",
              r.trades.duplicates > 0 && `${r.trades.duplicates} already stored`,
            ].filter(Boolean).join(", "),
            stats: [
              ["Deposits, withdrawals, adjustments", `${r.cashFlows.added} added`],
              ["Already stored", String(r.cashFlows.duplicates)],
              ...(skipped ? [["Not imported", skipped] as [string, string]] : []),
            ],
          }}
        />
        {skipped && (
          <p className="mt-3 text-sm text-muted-foreground">Credit and bonus deals are the broker's money, not yours, so they are left out.</p>
        )}
      </div>
      {dups.length > 0 && (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <CircleAlert className="size-4 shrink-0 text-muted-foreground" />
            {dups.length === 1 ? "This entry you added by hand" : `These ${dups.length} entries you added by hand`} may be the same money as an imported one
          </p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {dups.map((d) => (
              <li key={d.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate capitalize">{d.kind}, {formatDateTime(d.occurredAt, LOCAL_TZ)}</span>
                <span className="font-mono tabular-nums text-foreground">{money(d.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted-foreground">Nothing was deleted. Check them in Funding and delete the ones that are counted twice.</p>
        </div>
      )}
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <Button asChild><Link href="/">Go to dashboard</Link></Button>
        {(dups.length > 0 || r.cashFlows.added > 0) && (
          <Button asChild variant="outline"><Link href="/?tab=funding">Open Funding</Link></Button>
        )}
      </div>
    </section>
  )
}
