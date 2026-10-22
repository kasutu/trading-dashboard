import { NotebookPen } from "lucide-react"
import { SideBadge } from "@/components/dashboard/side-badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useTradeAnswers } from "@/hooks/use-answers"
import { useJournalContext } from "@/hooks/use-journal"
import type { Position } from "@/lib/api/types"
import { money, pnlClass } from "@/lib/format"
import { firstLine, moodOf } from "@/lib/journal"
import { cn } from "@/lib/utils"
import { PlanDot, RValue } from "./review-bits"
import { SaveStatus } from "./save-status"
import { TradeReviewEditor } from "./trade-review-editor"

/** The review cell of a trade row: plan dot, setup, mistake count and face, kept narrow. Click to edit in a popover.
 *  Put `group` on the row so the empty "review" icon shows on hover. */
export function TradeReviewCell({ ticket }: { ticket: string }) {
  const j = useJournalContext()
  const p = j?.positions.get(ticket)
  if (!j?.journal || !p) return null
  const r = j.trades.get(ticket)
  const setup = r?.setupId ? j.setups.get(r.setupId)?.name : undefined
  const m = moodOf(r?.mood)
  const mistakes = r?.mistakeIds.length ?? 0
  const label = r
    ? [r.followedPlan === null ? null : r.followedPlan ? "On plan" : "Off plan", setup, r.grade && `${r.grade} setup`,
       mistakes ? `${mistakes} mistake${mistakes === 1 ? "" : "s"}` : null, m?.label, firstLine(r.note)].filter(Boolean).join(", ")
    : ""

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={r ? `Edit review of ${p.symbol}: ${label}` : `Review ${p.symbol}`}
          title={label || "Review this trade"}
          className={cn(
            "inline-flex h-8 max-w-44 min-w-8 cursor-pointer items-center justify-center gap-1.5 rounded-md px-1.5 text-left text-xs transition-[background-color,opacity] hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none data-[state=open]:bg-muted",
            !r && "opacity-40 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 sm:opacity-0"
          )}
        >
          {r ? (
            <>
              {r.followedPlan !== null && <PlanDot value={r.followedPlan} />}
              {setup && <span className="hidden max-w-24 truncate text-muted-foreground xl:inline">{setup}</span>}
              {mistakes > 0 && <span className="rounded-full bg-loss/10 px-1.5 font-mono text-[11px] leading-5 text-loss tabular-nums">{mistakes}</span>}
              {m ? <span aria-hidden className="text-base leading-none">{m.emoji}</span> : !setup && !mistakes && r.followedPlan === null && <NotebookPen className="size-4 shrink-0" aria-hidden />}
            </>
          ) : (
            <NotebookPen className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[min(36rem,calc(100svh-6rem))] w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto p-0">
        <PopoverEditor position={p} />
      </PopoverContent>
    </Popover>
  )
}

function PopoverEditor({ position: p }: { position: Position }) {
  const answers = useTradeAnswers(p.ticket)
  return (
    <>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-popover px-4 py-3 text-sm">
        <span className="font-semibold">{p.symbol}</span>
        <SideBadge side={p.side} />
        <span className="text-xs text-muted-foreground">{p.lots} lots</span>
        <SaveStatus state={answers.state} className="ml-auto" />
        <span className={cn("font-mono font-medium tabular-nums", pnlClass(p.net))}>{money(p.net, true)}</span>
        <RValue r={p.r} className="text-xs" />
      </div>
      <TradeReviewEditor position={p} answers={answers} size="sm" className="p-4" />
    </>
  )
}
