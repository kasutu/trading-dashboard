import * as React from "react"
import { AlertTriangle, Lock, Pencil, Trash2 } from "lucide-react"
import { Link } from "wouter"
import { pillGroup, pillItem } from "@/components/dashboard/filter-bar"
import { Panel } from "@/components/dashboard/panel"
import { SideBadge } from "@/components/dashboard/side-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { invalidate, playbookPath, useJournalTags, usePlaybook } from "@/hooks/use-api"
import { useServerSettings } from "@/hooks/use-settings"
import { api } from "@/lib/api/client"
import type { PlanCalc, PlannedTrade, PlanSize, PlanStatus, Side, SymbolValue } from "@/lib/api/types"
import { formatDateTime, money, pnlClass, price } from "@/lib/format"
import { cn } from "@/lib/utils"

const NO_SETUP = "none"

/** Playbook: plan a trade with numbers before taking it. Jurno works out the risk, the reward and the lots, and warns
 *  when the trade breaks today's plan. Saved plans are matched to the trade they became after an import or sync. */
export function Playbook({ accountId, tz }: { accountId: string; tz: string }) {
  const { data, error } = usePlaybook(accountId, tz)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <Calculator accountId={accountId} tz={tz} symbols={data?.symbols ?? []} locked={data?.locked ?? true} />
      <Panel title="Planned trades" share={false} description={data?.locked ? undefined : "Matched to your trades after each import or sync."}>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!data ? (
          !error && <p className="text-sm text-muted-foreground">Loading…</p>
        ) : data.locked ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm">
            <Lock className="mx-auto mb-2 size-4 text-muted-foreground" />
            <p className="font-medium">Save plans and compare them with your trades</p>
            <p className="mt-1 text-muted-foreground">On Espresso and Latte. The calculator is free.</p>
            <Button asChild size="sm" variant="outline" className="mt-3"><Link href="/pricing">See plans</Link></Button>
          </div>
        ) : data.plans.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No planned trades yet. Plan one on the left and save it.</p>
        ) : (
          <ul className="divide-y">
            {data.plans.map((p) => <PlanRow key={p.id} accountId={accountId} tz={tz} p={p} />)}
          </ul>
        )}
      </Panel>
    </div>
  )
}

type Form = { symbol: string; side: Side; entry: string; stopLoss: string; takeProfit: string; by: PlanSize["by"]; size: string }
const EMPTY: Form = { symbol: "", side: "buy", entry: "", stopLoss: "", takeProfit: "", by: "lots", size: "" }

/** A typed number, or null when empty or not a number. Accepts a comma for the decimal point. */
const num = (s: string) => {
  const n = Number(s.trim().replace(",", "."))
  return s.trim() && Number.isFinite(n) ? n : null
}

function Calculator({ accountId, tz, symbols, locked }: { accountId: string; tz: string; symbols: SymbolValue[]; locked: boolean }) {
  const [f, setF] = React.useState<Form>(() => ({ ...EMPTY, symbol: symbols[0]?.symbol ?? "" }))
  if (!f.symbol && symbols[0]) setF({ ...f, symbol: symbols[0].symbol })
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }))
  const [calc, setCalc] = React.useState<PlanCalc | null>(null)
  const [calcError, setCalcError] = React.useState<string | null>(null)
  const [setupId, setSetupId] = React.useState(NO_SETUP)
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [saved, setSaved] = React.useState<string | null>(null)
  const [saveError, setSaveError] = React.useState<string | null>(null)
  const { data: tags } = useJournalTags()

  const body = React.useMemo(() => {
    const entry = num(f.entry), stopLoss = num(f.stopLoss), size = num(f.size)
    if (!f.symbol.trim() || entry === null || stopLoss === null || size === null) return null
    return { symbol: f.symbol.trim(), side: f.side, entry, stopLoss, takeProfit: num(f.takeProfit), size: { by: f.by, value: size }, tz }
  }, [f, tz])

  // Work the numbers out on the server as you type, a moment after the last key.
  const [version, setVersion] = React.useState(0)
  React.useEffect(() => {
    if (!body) return
    let live = true
    const id = window.setTimeout(() => {
      api<PlanCalc>(`${playbookPath(accountId)}/calc`, { method: "POST", body }).then(
        (c) => { if (live) { setCalc(c); setCalcError(null) } },
        (e: Error) => live && setCalcError(e.message)
      )
    }, 250)
    return () => { live = false; window.clearTimeout(id) }
  }, [accountId, body, version])
  const shown = body ? calc : null
  const m = shown?.math

  const save = async () => {
    if (!body) return
    setBusy(true)
    setSaveError(null)
    setSaved(null)
    try {
      await api(playbookPath(accountId), { method: "POST", body: { ...body, setupId: setupId === NO_SETUP ? null : setupId, note: note || null } })
      invalidate(playbookPath(accountId))
      setSaved(`Saved: ${body.side} ${body.symbol} at ${body.entry}.`)
      setF({ ...EMPTY, symbol: f.symbol, side: f.side, by: f.by, size: f.size })
      setNote("")
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const id = React.useId()
  const unit = { lots: "lots", risk: "$", percent: "%" }[f.by]
  return (
    <Panel title="Plan a trade" share={false} description="Numbers only: entry, stop loss, take profit and size. Jurno works out the rest.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-symbol`}>Symbol</Label>
            <Input id={`${id}-symbol`} list={`${id}-symbols`} value={f.symbol} autoCapitalize="characters" onChange={(e) => set({ symbol: e.target.value.toUpperCase() })} placeholder="XAUUSD" />
            <datalist id={`${id}-symbols`}>{symbols.map((s) => <option key={s.symbol} value={s.symbol} />)}</datalist>
          </div>
          <div className="space-y-1.5">
            <Label id={`${id}-side`}>Side</Label>
            <ToggleGroup type="single" spacing={1} className={cn(pillGroup, "w-full")} value={f.side} onValueChange={(v) => v && set({ side: v as Side })} aria-labelledby={`${id}-side`}>
              <ToggleGroupItem value="buy" className={cn(pillItem, "flex-1")}>Buy</ToggleGroupItem>
              <ToggleGroupItem value="sell" className={cn(pillItem, "flex-1")}>Sell</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <PriceField id={`${id}-entry`} label="Entry" value={f.entry} onChange={(entry) => set({ entry })} />
          <PriceField id={`${id}-sl`} label="Stop loss" value={f.stopLoss} onChange={(stopLoss) => set({ stopLoss })} />
          <PriceField id={`${id}-tp`} label="Take profit" hint="Optional" value={f.takeProfit} onChange={(takeProfit) => set({ takeProfit })} />
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-size`}>Size</Label>
            <div className="relative">
              <Input id={`${id}-size`} inputMode="decimal" value={f.size} onChange={(e) => set({ size: e.target.value })} placeholder={f.by === "lots" ? "0.01" : f.by === "risk" ? "20" : "1"} className="pr-12 text-right tabular-nums" />
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{unit}</span>
            </div>
          </div>
        </div>
        <ToggleGroup type="single" spacing={1} className={pillGroup} value={f.by} onValueChange={(v) => v && set({ by: v as PlanSize["by"] })} aria-label="Size by">
          <ToggleGroupItem value="lots" className={pillItem}>Lots</ToggleGroupItem>
          <ToggleGroupItem value="risk" className={pillItem}>Dollar risk</ToggleGroupItem>
          <ToggleGroupItem value="percent" className={pillItem}>% of balance</ToggleGroupItem>
        </ToggleGroup>

        {shown && <PointValue accountId={accountId} value={shown.value} onSaved={() => setVersion((v) => v + 1)} />}

        {m && m.errors.length > 0 ? (
          <ul className="space-y-1 text-sm text-destructive" role="alert">{m.errors.map((e) => <li key={e}>{e}</li>)}</ul>
        ) : m ? (
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-sm">
            <Stat label="Lots" value={m.lots?.toFixed(2) ?? "—"} />
            <Stat label="Risk" value={m.risk === null ? "—" : money(m.risk)} sub={m.riskPercent === null ? `${m.slPoints} pts` : `${m.riskPercent}% · ${m.slPoints} pts`} tone="loss" />
            <Stat label="Reward" value={m.reward === null ? "—" : money(m.reward)} sub={m.tpPoints === null ? "No take profit" : `${m.tpPoints} pts`} tone="profit" />
            <Stat label="R:R" value={m.rr === null ? "—" : `1 : ${m.rr}`} />
            <Stat label="Balance" value={shown?.balance == null ? "—" : money(shown.balance)} sub={shown?.balance == null ? "Add deposits in Funding" : undefined} />
            <MinRr />
          </dl>
        ) : (
          !calcError && <p className="text-sm text-muted-foreground">Enter the entry, stop loss and size to see the risk.</p>
        )}
        {calcError && <p role="alert" className="text-sm text-destructive">{calcError}</p>}

        {shown && shown.checks.length > 0 && !m?.errors.length && (
          <ul className="space-y-1.5 rounded-lg border border-loss/40 bg-loss/5 p-3 text-sm" aria-label="Against today's plan">
            {shown.checks.map((c) => (
              <li key={c.rule} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 flex-none text-loss" />{c.text}</li>
            ))}
          </ul>
        )}

        {!locked && (
          <div className="space-y-3 border-t pt-4">
            {tags && tags.setups.some((s) => !s.archived) && (
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor={`${id}-setup`} className="font-normal">Setup</Label>
                <Select value={setupId} onValueChange={setSetupId}>
                  <SelectTrigger id={`${id}-setup`} size="sm" className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SETUP}>None</SelectItem>
                    {tags.setups.filter((s) => !s.archived).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Textarea aria-label="Note" placeholder="Why this trade? (optional)" value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} className="resize-none" />
          </div>
        )}
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        {saved && <p role="status" className="text-sm text-muted-foreground">{saved}</p>}
        {locked ? (
          <p className="text-sm text-muted-foreground"><Lock className="mr-1 inline size-3.5" />Saving plans is on Espresso and Latte.</p>
        ) : (
          <Button type="submit" className="w-full" disabled={busy || !m || m.errors.length > 0}>{busy ? "Saving…" : "Save plan"}</Button>
        )}
      </form>
    </Panel>
  )
}

function PriceField({ id, label, hint, value, onChange }: { id: string; label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{hint && <span className="ml-1 text-xs font-normal text-muted-foreground">{hint}</span>}</Label>
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="text-right tabular-nums" />
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "profit" | "loss" }) {
  return (
    <div className="bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 font-mono font-medium tabular-nums", value !== "—" && tone === "profit" && "text-profit", value !== "—" && tone === "loss" && "text-loss")}>{value}</dd>
      {sub && <dd className="text-xs text-muted-foreground">{sub}</dd>}
    </div>
  )
}

/** The smallest R:R you take without a warning. Saved on the server. */
function MinRr() {
  const { server, update } = useServerSettings()
  const [error, setError] = React.useState(false)
  return (
    <div className="bg-card p-3">
      <label htmlFor="min-rr" className="text-xs text-muted-foreground">Warn below R:R</label>
      <Input
        id="min-rr"
        key={server.minRr ?? "none"}
        inputMode="decimal"
        defaultValue={server.minRr ?? ""}
        placeholder="None"
        aria-invalid={error}
        onBlur={(e) => {
          const v = num(e.target.value)
          if (v === server.minRr) return
          update({ minRr: v }).then(() => setError(false), () => setError(true))
        }}
        className="mt-0.5 h-7 px-2 font-mono text-sm"
      />
    </div>
  )
}

/** What one point is worth, from the account's trades or entered here. */
function PointValue({ accountId, value: v, onSaved }: { accountId: string; value: SymbolValue; onSaved: () => void }) {
  const [editing, setEditing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const path = `${playbookPath(accountId)}/symbols/${encodeURIComponent(v.symbol)}`
  const from = v.source === "user" ? "entered by you" : v.source === "trades" ? `from ${v.trades} of your trades` : "no trades to work it out from"

  if (editing)
    return (
      <form
        className="space-y-2 rounded-lg border p-3"
        onSubmit={async (e) => {
          e.preventDefault()
          const form = new FormData(e.currentTarget)
          try {
            await api(path, { method: "PUT", body: { point: num(String(form.get("point"))), valuePerPoint: num(String(form.get("value"))) } })
            invalidate(playbookPath(accountId))
            setEditing(false)
            onSaved()
          } catch (err) {
            setError((err as Error).message)
          }
        }}
      >
        <p className="text-sm font-medium">{v.symbol}: value of one point</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="pv-point" className="text-xs font-normal text-muted-foreground">Point size</Label>
            <Input id="pv-point" name="point" inputMode="decimal" defaultValue={v.point} className="h-8 font-mono" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pv-value" className="text-xs font-normal text-muted-foreground">$ per point, 1 lot</Label>
            <Input id="pv-value" name="value" inputMode="decimal" defaultValue={v.valuePerPoint ?? ""} className="h-8 font-mono" />
          </div>
        </div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm">Save</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          {v.source === "user" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto"
              onClick={async () => {
                await api(path, { method: "DELETE" })
                invalidate(playbookPath(accountId))
                setEditing(false)
                onSaved()
              }}
            >
              Use my trades
            </Button>
          )}
        </div>
      </form>
    )
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <p className={cn("text-muted-foreground", v.valuePerPoint === null && "text-loss")}>
        {v.valuePerPoint === null
          ? `Enter what one point of ${v.symbol} is worth to see the money.`
          : `1 point = ${price(v.point)} · ${money(v.valuePerPoint)} a lot, ${from}.`}
      </p>
      <Button type="button" size="icon-sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Edit the value of a point on ${v.symbol}`}>
        <Pencil />
      </Button>
    </div>
  )
}

const STATUS: Record<PlanStatus, string> = { planned: "Planned", taken: "Taken", skipped: "Skipped" }

function PlanRow({ accountId, tz, p }: { accountId: string; tz: string; p: PlannedTrade }) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const run = async (method: "PATCH" | "DELETE", body?: unknown) => {
    setBusy(true)
    setError(null)
    try {
      await api(`${playbookPath(accountId)}/${p.id}`, { method, body: body && { ...body, tz } })
      invalidate(playbookPath(accountId))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const r = p.result
  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{p.symbol}</span>
        <SideBadge side={p.side} />
        <span className={cn("rounded-full px-2 py-0.5 text-xs", p.status === "taken" ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}>{STATUS[p.status]}</span>
        <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(p.createdAt, tz)}</span>
      </div>
      <p className="font-mono text-xs text-muted-foreground tabular-nums">
        {p.lots} lots at {price(p.entry)} · SL {price(p.stopLoss)} · TP {price(p.takeProfit)}
        {p.math.risk !== null && ` · risk ${money(p.math.risk)}`}
        {p.math.rr !== null && ` · 1:${p.math.rr}`}
      </p>
      {p.note && <p className="text-sm">{p.note}</p>}
      {r && (
        <div className="rounded-lg bg-muted/60 p-2.5 text-sm">
          <p>
            Result <span className={cn("font-mono tabular-nums", pnlClass(r.net))}>{money(r.net, true)}</span>
            {r.r !== null && <span className="text-muted-foreground"> ({r.r}R)</span>}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            <li>
              Entry {price(r.openPrice)}
              {r.slippagePoints === 0 ? ", as planned" : `, ${Math.abs(r.slippagePoints)} pts ${r.slippagePoints > 0 ? "worse" : "better"}`}
            </li>
            {r.lotsChanged && <li>{r.lots} lots instead of {p.lots}</li>}
            {r.slMoved !== null && <li>Stop loss at {price(r.slMoved)} instead of {price(p.stopLoss)}</li>}
            {r.tpMoved !== null && <li>Take profit at {price(r.tpMoved)} instead of {price(p.takeProfit)}</li>}
          </ul>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-1">
        {p.status !== "skipped" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run("PATCH", { status: "skipped" })}>Skipped it</Button>}
        {p.status === "skipped" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run("PATCH", { status: "planned" })}>Back to planned</Button>}
        <Button size="icon-sm" variant="ghost" className="ml-auto" disabled={busy} onClick={() => run("DELETE")} aria-label={`Delete the ${p.symbol} plan`}>
          <Trash2 />
        </Button>
      </div>
    </li>
  )
}
