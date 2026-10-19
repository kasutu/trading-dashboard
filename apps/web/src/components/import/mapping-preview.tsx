import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ColumnMapping } from "@/lib/api/types"
import { FIELDS } from "@/lib/mapping"

/** The first rows of the file as Jurno will read them. */
export function MappingPreview({ mapping, rows }: { mapping: ColumnMapping; rows: Record<string, string>[] }) {
  const cols = FIELDS.filter((f) => mapping.columns[f.field])
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-card">
      <header className="px-5 pt-5 pb-3">
        <h2 className="text-sm font-semibold">Preview</h2>
        <p className="mt-1 text-sm text-muted-foreground">The first {rows.length} rows of your file, as Jurno reads them.</p>
      </header>
      {cols.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">Pick a column above to see it here.</p>
      ) : (
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              {cols.map((c) => <TableHead key={c.field} className="first:pl-5 last:pr-5">{c.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i}>
                {cols.map((c) => (
                  <TableCell key={c.field} className="font-mono text-xs first:pl-5 last:pr-5">
                    {r[mapping.columns[c.field]!] || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
