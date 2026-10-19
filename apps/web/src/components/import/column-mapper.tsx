import * as React from "react"
import { Check, FileText, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { invalidate, useMappings } from "@/hooks/use-api"
import { api } from "@/lib/api/client"
import { REQUIRED_FIELDS, type ColumnMapping, type Field, type Import } from "@/lib/api/types"
import { LOCAL_TZ } from "@/lib/format"
import { FIELDS, FILE_TIMEZONES, fieldLabel, fitMapping, matchesPreset } from "@/lib/mapping"
import { MappingPreview } from "./mapping-preview"

export type CsvFile = { name: string; text: string; headers: string[]; rows: Record<string, string>[] }

type Props = { file: CsvFile; accountId: string; preset: ColumnMapping | undefined; onImported: (r: Import) => void; onReset: () => void }

const NONE = "__none"

/** Map the file's columns to trade fields, preview the result and import. */
export function ColumnMapper({ file, accountId, preset, onImported, onReset }: Props) {
  const detected = !!preset && matchesPreset(preset, file.headers)
  const [mapping, setMapping] = React.useState<ColumnMapping>(() =>
    detected ? fitMapping(preset, file.headers) : { columns: {}, timestampsTz: "UTC" }
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const saved = useMappings()
  const headers = file.headers.filter(Boolean)
  const missing = REQUIRED_FIELDS.filter((f) => !mapping.columns[f])

  const setColumn = (f: Field, h: string) =>
    setMapping((m) => {
      const columns = { ...m.columns }
      if (h === NONE) delete columns[f]
      else columns[f] = h
      return { ...m, columns }
    })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await api<Import>(`/accounts/${accountId}/imports`, {
        method: "POST",
        body: { fileName: file.name, csv: file.text, mapping },
      })
      invalidate("/accounts")
      onImported(result)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onReset}>Choose another file</Button>
        {detected && (
          <p className="flex w-full items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4 text-brand" />
            Exness export detected. The columns are filled in. Check them, then import.
          </p>
        )}
      </div>

      {!!saved.data?.length && (
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor="saved-mapping">Saved mappings</Label>
          <Select onValueChange={(id) => setMapping(fitMapping(saved.data!.find((m) => m.id === id)!.mapping, headers))}>
            <SelectTrigger id="saved-mapping" className="w-56 bg-card"><SelectValue placeholder="Use a saved mapping" /></SelectTrigger>
            <SelectContent>
              {saved.data.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <section className="rounded-xl border bg-card p-5 shadow-xs">
        <h2 className="text-sm font-semibold">Match the columns</h2>
        <p className="mt-1 text-sm text-muted-foreground">For each field, pick the column in your file that holds it.</p>
        <div className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
          {FIELDS.map(({ field, label, hint }) => {
            const required = REQUIRED_FIELDS.includes(field)
            return (
              <div key={field} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3">
                <Label htmlFor={`col-${field}`} className="flex flex-wrap items-baseline gap-x-1.5 font-normal">
                  {label}
                  {required && <span className="text-xs text-muted-foreground">(required)</span>}
                  {hint && <span className="w-full text-xs text-muted-foreground">{hint}</span>}
                </Label>
                <Select value={mapping.columns[field] ?? NONE} onValueChange={(h) => setColumn(field, h)}>
                  <SelectTrigger id={`col-${field}`} className="w-full bg-card" aria-invalid={required && !mapping.columns[field]}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}><span className="text-muted-foreground">Not in file</span></SelectItem>
                    {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )
          })}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3">
            <Label htmlFor="file-tz" className="flex flex-wrap items-baseline font-normal">
              Timezone of the times
              <span className="w-full text-xs text-muted-foreground">Exness uses UTC.</span>
            </Label>
            <Select value={mapping.timestampsTz} onValueChange={(tz) => setMapping((m) => ({ ...m, timestampsTz: tz }))}>
              <SelectTrigger id="file-tz" className="w-full bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[...new Set([mapping.timestampsTz, ...FILE_TIMEZONES])].map((z) => (
                  <SelectItem key={z} value={z}>{z === LOCAL_TZ ? `${z} (local)` : z}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <MappingPreview mapping={mapping} rows={file.rows} />

      <SaveMapping mapping={mapping} />

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {missing.length > 0 && (
          <p className="mr-auto text-sm text-muted-foreground">Pick a column for {missing.map((f) => fieldLabel(f).toLowerCase()).join(", ")}.</p>
        )}
        <Button type="submit" disabled={busy || missing.length > 0}>{busy ? "Importing…" : "Import trades"}</Button>
      </div>
    </form>
  )
}

/** Name the mapping and save it for the next file. */
function SaveMapping({ mapping }: { mapping: ColumnMapping }) {
  const [name, setName] = React.useState("")
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null)

  const save = async () => {
    try {
      await api("/mappings", { method: "POST", body: { name: name.trim(), mapping } })
      invalidate("/mappings")
      setStatus({ ok: true, text: "Mapping saved." })
    } catch (err) {
      setStatus({ ok: false, text: (err as Error).message })
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-xs">
      <Label htmlFor="mapping-name">Save this mapping (optional)</Label>
      <p className="mt-1 text-sm text-muted-foreground">Next time, pick it from the list at the top.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input id="mapping-name" className="max-w-xs" placeholder="For example: My MT5 broker" value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setStatus(null) }} />
        <Button type="button" variant="outline" disabled={!name.trim()} onClick={save}>Save mapping</Button>
      </div>
      {status && (
        <p role="status" className={status.ok ? "mt-2 flex items-center gap-1.5 text-sm text-muted-foreground" : "mt-2 text-sm text-destructive"}>
          {status.ok && <Check className="size-4 text-profit" />} {status.text}
        </p>
      )}
    </section>
  )
}
