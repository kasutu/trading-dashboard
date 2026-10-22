import { useJournalContext } from "@/hooks/use-journal"
import type { TradeReview } from "@/lib/api/types"
import { formatR, moodOf } from "@/lib/journal"
import { cn } from "@/lib/utils"

/** Green for on plan, red for off plan, hollow for not answered. */
export function PlanDot({ value, className }: { value: boolean | null; className?: string }) {
  return (
    <span
      role="img"
      aria-label={value === null ? "Plan not answered" : value ? "On plan" : "Off plan"}
      title={value === null ? undefined : value ? "On plan" : "Off plan"}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        value === null ? "border border-muted-foreground/50" : value ? "bg-profit" : "bg-loss",
        className
      )}
    />
  )
}

export function RValue({ r, className }: { r: number | null; className?: string }) {
  if (r === null) return null
  return <span className={cn("font-mono tabular-nums", r > 0 ? "text-profit" : r < 0 ? "text-loss" : "text-muted-foreground", className)}>{formatR(r)}</span>
}

/** The answers of a trade review in one line: plan, setup, grade, mistakes, face. `chips` lists the mistakes by name;
 *  otherwise only their count shows. */
export function ReviewBits({ review, chips = false, className }: { review: TradeReview; chips?: boolean; className?: string }) {
  const j = useJournalContext()!
  const setup = review.setupId ? j.setups.get(review.setupId)?.name : undefined
  const mistakes = review.mistakeIds.map((id) => j.mistakes.get(id)?.name).filter(Boolean) as string[]
  const m = moodOf(review.mood)
  return (
    <span className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground", className)}>
      {review.followedPlan !== null && (
        <span className="inline-flex items-center gap-1.5">
          <PlanDot value={review.followedPlan} />
          <span aria-hidden>{review.followedPlan ? "On plan" : "Off plan"}</span>
        </span>
      )}
      {setup && <span className="truncate font-medium text-foreground">{setup}</span>}
      {review.grade && <span className="rounded border px-1 font-mono font-semibold text-foreground" title={`${review.grade} setup`}>{review.grade}</span>}
      {chips
        ? mistakes.map((n) => (
            <span key={n} className="rounded-full bg-loss/10 px-2 py-0.5 text-loss">{n}</span>
          ))
        : mistakes.length > 0 && (
            <span className="rounded-full bg-loss/10 px-1.5 py-0.5 text-loss" title={mistakes.join(", ")}>
              {mistakes.length === 1 ? mistakes[0] : `${mistakes.length} mistakes`}
            </span>
          )}
      {review.noMistakes && chips && <span>No mistakes</span>}
      {m && <span title={m.label}><span aria-hidden className="text-sm leading-none">{m.emoji}</span><span className="sr-only">{m.label}</span></span>}
    </span>
  )
}
