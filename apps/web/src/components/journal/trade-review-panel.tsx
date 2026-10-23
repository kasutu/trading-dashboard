import * as React from "react"
import { ChevronRight, NotebookPen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTradeAnswers } from "@/hooks/use-answers"
import { useJournalContext } from "@/hooks/use-journal"
import type { Position } from "@/lib/api/types"
import { firstLine } from "@/lib/journal"
import { ReviewBits } from "./review-bits"
import { SaveStatus } from "./save-status"
import { TradeReviewEditor } from "./trade-review-editor"

/** On a trade card in the day sheet: "Review", or the answers so far. Click to edit every answer in place. */
export function TradeReviewPanel({ ticket }: { ticket: string }) {
  const j = useJournalContext()
  const [editing, setEditing] = React.useState(false)
  const p = j?.positions.get(ticket)
  if (!j?.journal || !p) return null
  const r = j.trades.get(ticket)

  if (editing) return <InlineEditor position={p} onDone={() => setEditing(false)} />

  if (!r)
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md text-sm sm:mt-3 sm:min-h-0 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <NotebookPen className="size-4" aria-hidden /> Review this trade
      </button>
    )

  const line = firstLine(r.note)
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label="Edit the review of this trade"
      className="mt-3 flex w-full cursor-pointer items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="min-w-0 flex-1 space-y-1">
        <ReviewBits review={r} chips />
        {line && <span className="block truncate">{line}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}

function InlineEditor({ position, onDone }: { position: Position; onDone: () => void }) {
  const answers = useTradeAnswers(position.ticket)
  return (
    <div className="mt-3 border-t pt-3">
      <div className="mb-3 flex min-h-7 items-center gap-2">
        <p className="text-sm font-semibold">Review</p>
        <SaveStatus state={answers.state} className="ml-auto" />
        <Button variant="ghost" size="sm" className="-my-2 px-3 sm:my-0 sm:h-7 sm:px-2" onClick={onDone}>Done</Button>
      </div>
      <TradeReviewEditor position={position} answers={answers} size="sm" />
    </div>
  )
}
