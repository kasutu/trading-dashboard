import * as React from "react"
import Papa from "papaparse"
import { ArrowLeft, CircleCheck, FileUp, Plus } from "lucide-react"
import { Link } from "wouter"
import { NewAccountDialog } from "@/components/account/new-account-dialog"
import { ColumnMapper, type CsvFile } from "@/components/import/column-mapper"
import { FileButton } from "@/components/import/file-button"
import { Mt5Import, type ReportFile } from "@/components/import/mt5-import"
import { EmptyState } from "@/components/layout/empty-state"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useImports, usePresets } from "@/hooks/use-api"
import { useNarrow } from "@/hooks/use-media"
import type { Account, Import } from "@/lib/api/types"
import { LOCAL_TZ, formatDateTime, plural } from "@/lib/format"
import { decodeText, isMt5Report } from "@/lib/mt5"
import { cn } from "@/lib/utils"

const MAX_BYTES = 20 * 1024 * 1024

type Loaded = { kind: "csv"; file: CsvFile } | { kind: "mt5"; file: ReportFile }

/** Read a file: an MT5 report (HTML, often UTF-16) or a CSV file (its headers and first 5 rows). */
async function readFile(f: File): Promise<Loaded> {
  if (f.size > MAX_BYTES) throw new Error("This file is larger than 20 MB. Export a shorter date range and try again.")
  const text = decodeText(await f.arrayBuffer())
  if (isMt5Report(text)) return { kind: "mt5", file: { name: f.name, text } }
  if (/\.html?$/i.test(f.name))
    throw new Error("This HTML file is not a MetaTrader 5 trade history report. In MetaTrader 5, open the History tab, right-click, choose Report, then HTML.")
  return { kind: "csv", file: readCsv(f.name, text) }
}

function readCsv(name: string, text: string): CsvFile {
  const { data, meta } = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    preview: 5,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  if (!meta.fields?.length || !data.length) throw new Error("This file has no rows. Choose a CSV file with a header row and trades.")
  return { name, text, headers: meta.fields, rows: data }
}

/** Import a CSV file (with the column mapper) or an MT5 report (with a preview) into the selected account. */
export function ImportPage({ account, onSelect }: { account: Account | null; onSelect: (id: string) => void }) {
  const [file, setFile] = React.useState<Loaded | null>(null)
  const [result, setResult] = React.useState<Import | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [over, setOver] = React.useState(false)
  const presets = usePresets()

  if (!account)
    return (
      <EmptyState title="Create a trading account first" text="Trades are imported into a trading account.">
        <NewAccountDialog onCreated={(a) => onSelect(a.id)}>
          <Button><Plus /> New account</Button>
        </NewAccountDialog>
      </EmptyState>
    )

  const load = async (f: File) => {
    try {
      setFile(await readFile(f))
      setResult(null)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  const reset = () => { setFile(null); setResult(null) }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm sm:min-h-0 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          <ArrowLeft className="size-4" /> {account.name}
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-balance sm:mt-2 sm:text-3xl">Import trades into {account.name}</h1>
        <p className="mt-1 text-muted-foreground">Trades you already imported are not added twice.</p>
      </div>

      {result ? (
        <ImportResult result={result} onAgain={reset} />
      ) : file?.kind === "mt5" ? (
        <Mt5Import key={file.file.name + file.file.text.length} file={file.file} accountId={account.id} onReset={reset} />
      ) : file ? (
        presets.loading && !presets.data ? (
          <p className="text-sm text-muted-foreground">Reading the file…</p>
        ) : (
          <ColumnMapper key={file.file.name + file.file.text.length} file={file.file} accountId={account.id} preset={presets.data?.exness} onImported={setResult} onReset={reset} />
        )
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const f = e.dataTransfer.files[0]
            if (f) load(f)
          }}
          className={cn(
            "flex flex-col items-center gap-4 rounded-xl border-2 border-dashed bg-card px-5 py-10 text-center transition-colors sm:px-6 sm:py-14",
            over && "border-foreground/40 bg-muted"
          )}
        >
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <FileUp className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Drop your MT5 report or CSV file here</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              An MT5 report brings your trades, deposits and withdrawals. Exness CSV exports work as they are; for other CSV files, you match the columns.
            </p>
          </div>
          <FileButton onFile={load}>Choose file</FileButton>
        </div>
      )}

      {!file && !result && <ReportHowTo />}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      <PastImports accountId={account.id} />
    </div>
  )
}

/** Where to find the MT5 report. */
function ReportHowTo() {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <h2 className="text-sm font-semibold">Get your MetaTrader 5 report</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>In MetaTrader 5 on your computer, open the <span className="text-foreground">History</span> tab (View → Toolbox).</li>
        <li>Right-click the list, pick the period (All History), then right-click again and choose <span className="text-foreground">Report → HTML</span>.</li>
        <li>Drop the saved file here. Importing it again later adds only what is new.</li>
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">MetaTrader 4 reports are not supported yet.</p>
    </section>
  )
}

function ImportResult({ result: r, onAgain }: { result: Import; onAgain: () => void }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card sm:p-6">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CircleCheck className="size-4 text-profit" /> Import done
      </p>
      <p className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">{plural(r.added, "trade")} added</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {r.duplicates} already stored, {plural(r.skipped, "row")} skipped.
      </p>
      {r.skipped > 0 && <p className="mt-1 text-sm text-muted-foreground">Skipped rows have no valid open time, close time or profit.</p>}
      <div className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
        <Button asChild><Link href="/">Go to dashboard</Link></Button>
        <Button variant="outline" onClick={onAgain}>Import another file</Button>
      </div>
    </section>
  )
}

function PastImports({ accountId }: { accountId: string }) {
  const { data } = useImports(accountId)
  const narrow = useNarrow()
  if (!data?.length) return null
  const num = "text-right font-mono tabular-nums"
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-card">
      <h2 className="px-5 pt-5 pb-3 text-sm font-semibold">Past imports</h2>
      {narrow ? (
        <ul className="divide-y border-t">
          {data.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{i.fileName}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(i.createdAt, LOCAL_TZ)}, {i.duplicates} already stored, {i.skipped} skipped
                </p>
              </div>
              <span className="font-mono text-sm tabular-nums">+{i.added}</span>
            </li>
          ))}
        </ul>
      ) : (
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="pl-5">File</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Added</TableHead>
            <TableHead className="text-right">Already stored</TableHead>
            <TableHead className="pr-5 text-right">Skipped</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="max-w-48 truncate pl-5 font-medium">{i.fileName}</TableCell>
              <TableCell className="text-muted-foreground">{formatDateTime(i.createdAt, LOCAL_TZ)}</TableCell>
              <TableCell className={num}>{i.added}</TableCell>
              <TableCell className={num}>{i.duplicates}</TableCell>
              <TableCell className={cn("pr-5", num)}>{i.skipped}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      )}
    </section>
  )
}
