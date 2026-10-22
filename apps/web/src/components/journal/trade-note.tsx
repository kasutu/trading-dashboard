import * as React from "react"
import { NotebookPen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useJournalContext } from "@/hooks/use-journal"
import { firstLine, moodOf } from "@/lib/journal"
import { JournalEditor } from "./journal-editor"

/** On a trade card in the day sheet: "Add note", or the mood and first line of the note. Click to edit in place. */
export function TradeNote({ ticket }: { ticket: string }) {
  const j = useJournalContext()
  const [editing, setEditing] = React.useState(false)
  if (!j?.journal) return null
  const entry = j.trades.get(ticket)
  const m = moodOf(entry?.mood)

  if (editing)
    return (
      <JournalEditor
        className="mt-3 border-t pt-3"
        size="sm"
        entry={entry}
        prompt="How did this trade go?"
        autoFocus
        onSave={(input) => j.save({ ticket }, input)}
        action={<Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing(false)}>Done</Button>}
      />
    )

  if (!entry)
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <NotebookPen className="size-4" aria-hidden /> Add note
      </button>
    )

  const line = firstLine(entry.note)
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={`Edit note: ${[m?.label, line].filter(Boolean).join(", ")}`}
      className="mt-3 flex w-full cursor-pointer items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {m ? <span aria-hidden className="text-base leading-none">{m.emoji}</span> : <NotebookPen className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      <span className={line ? "truncate" : "text-muted-foreground"}>{line || m?.label}</span>
    </button>
  )
}
