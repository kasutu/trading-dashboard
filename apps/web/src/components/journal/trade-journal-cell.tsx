import { NotebookPen } from "lucide-react"
import { SideBadge } from "@/components/dashboard/side-badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useJournalContext } from "@/hooks/use-journal"
import type { LocalTrade } from "@/lib/api/types"
import { money, pnlClass } from "@/lib/format"
import { firstLine, moodOf } from "@/lib/journal"
import { cn } from "@/lib/utils"
import { JournalEditor } from "./journal-editor"

/** The last cell of a trade row: the trade's mood (and note on wide screens). Click to edit in a popover.
 *  Put `group` on the row so the empty "add" icon shows on hover. */
export function TradeJournalCell({ trade }: { trade: LocalTrade }) {
  const j = useJournalContext()
  if (!j?.journal) return null
  const entry = j.trades.get(trade.ticket)
  const m = moodOf(entry?.mood)
  const line = firstLine(entry?.note)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={entry ? `Edit note for ${trade.symbol}: ${[m?.label, line].filter(Boolean).join(", ")}` : `Add a note to ${trade.symbol}`}
          title={line || m?.label || "Add a note"}
          className={cn(
            "inline-flex h-8 max-w-56 min-w-8 cursor-pointer items-center justify-center gap-2 rounded-md px-1.5 text-left transition-[background-color,opacity] hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-muted",
            !entry && "opacity-40 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 sm:opacity-0"
          )}
        >
          {m ? (
            <span aria-hidden className="text-base leading-none">{m.emoji}</span>
          ) : (
            <NotebookPen className={cn("size-4 shrink-0", !entry && "text-muted-foreground")} aria-hidden />
          )}
          {line && <span className="hidden truncate text-muted-foreground xl:inline">{line}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="mb-3 flex items-center gap-2 border-b pb-3 text-sm">
          <span className="font-semibold">{trade.symbol}</span>
          <SideBadge side={trade.side} />
          <span className="text-xs text-muted-foreground">{trade.lots} lots</span>
          <span className={cn("ml-auto font-mono font-medium tabular-nums", pnlClass(trade.net))}>{money(trade.net, true)}</span>
        </div>
        <JournalEditor size="sm" entry={entry} prompt="How did this trade go?" onSave={(input) => j.save({ ticket: trade.ticket }, input)} />
      </PopoverContent>
    </Popover>
  )
}
