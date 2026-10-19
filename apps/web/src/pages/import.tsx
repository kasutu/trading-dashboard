import * as React from "react"
import Papa from "papaparse"
import { ArrowLeft, CircleCheck, FileUp, Plus } from "lucide-react"
import { Link } from "wouter"
import { NewAccountDialog } from "@/components/account/new-account-dialog"
import { ColumnMapper, type CsvFile } from "@/components/import/column-mapper"
import { FileButton } from "@/components/import/file-button"
import { EmptyState } from "@/components/layout/empty-state"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useImports, usePresets } from "@/hooks/use-api"
import type { Account, Import } from "@/lib/api/types"
import { plural } from "@/lib/format"
import { cn } from "@/lib/utils"

const MAX_BYTES = 20 * 1024 * 1024

/** Read the headers and the first 5 rows of a CSV file. */
async function readCsv(f: File): Promise<CsvFile> {
  if (f.size > MAX_BYTES) throw new Error("This file is larger than 20 MB. Export a shorter date range and try again.")
  const text = await f.text()
  const { data, meta } = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    preview: 5,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  if (!meta.fields?.length || !data.length) throw new Error("This file has no rows. Choose a CSV file with a header row and trades.")
  return { name: f.name, text, headers: meta.fields, rows: data }
}

/** Import a CSV file into the selected account with the column mapper. */
export function ImportPage({ account, onSelect }: { account: Account | null; onSelect: (id: string) => void }) {
  const [file, setFile] = React.useState<CsvFile | null>(null)
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
      setFile(await readCsv(f))
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
        <Link href="/" className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          <ArrowLeft className="size-4" /> {account.name}
        </Link>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">Import trades into {account.name}</h1>
        <p className="mt-1 text-muted-foreground">Trades you already imported are not added twice.</p>
      </div>

      {result ? (
        <ImportResult result={result} onAgain={reset} />
      ) : file ? (
        presets.loading && !presets.data ? (
          <p className="text-sm text-muted-foreground">Reading the file…</p>
        ) : (
          <ColumnMapper key={file.name + file.text.length} file={file} accountId={account.id} preset={presets.data?.exness} onImported={setResult} onReset={reset} />
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
            "flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed bg-card px-6 py-14 text-center transition-colors",
            over && "border-brand bg-highlight/20"
          )}
        >
          <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
            <FileUp className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Drop your CSV file here</p>
            <p className="mt-1 text-sm text-muted-foreground">Exness exports work as they are. For other brokers, you match the columns.</p>
          </div>
          <FileButton onFile={load}>Choose CSV file</FileButton>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      <PastImports accountId={account.id} />
    </div>
  )
}

function ImportResult({ result: r, onAgain }: { result: Import; onAgain: () => void }) {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-xs">
      <p className="flex items-center gap-2 font-display text-xl font-bold">
        <CircleCheck className="size-5 text-profit" /> Import done
      </p>
      <p className="mt-2 text-muted-foreground">
        {plural(r.added, "trade")} added, {r.duplicates} already stored, {plural(r.skipped, "row")} skipped.
      </p>
      {r.skipped > 0 && <p className="mt-1 text-sm text-muted-foreground">Skipped rows have no valid open time, close time or profit.</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild><Link href="/">Go to dashboard</Link></Button>
        <Button variant="outline" onClick={onAgain}>Import another file</Button>
      </div>
    </section>
  )
}

function PastImports({ accountId }: { accountId: string }) {
  const { data } = useImports(accountId)
  if (!data?.length) return null
  const num = "text-right font-mono tabular-nums"
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <h2 className="px-5 pt-5 pb-3 text-sm font-semibold">Past imports</h2>
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
              <TableCell className="text-muted-foreground">{new Date(i.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</TableCell>
              <TableCell className={num}>{i.added}</TableCell>
              <TableCell className={num}>{i.duplicates}</TableCell>
              <TableCell className={cn("pr-5", num)}>{i.skipped}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}
