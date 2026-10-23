import { Layers } from "lucide-react"
import { JournalInsights } from "@/components/journal/journal-insights"
import { JournalList } from "@/components/journal/journal-list"
import { Button } from "@/components/ui/button"
import { useJournalContext } from "@/hooks/use-journal"
import { plural, relativeDay } from "@/lib/format"
import { isReviewed } from "@/lib/journal"

/** Your journal (every plan) and what it says (paid plans), with the newest day to review on top. */
export function Journal() {
  return (
    <div className="space-y-4">
      <ToReview />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <JournalList />
        <div className="lg:sticky lg:top-20">
          <JournalInsights />
        </div>
      </div>
    </div>
  )
}

/** The newest day with trades not reviewed yet, and how many are left in all. Hidden when every trade is reviewed. */
function ToReview() {
  const j = useJournalContext()
  const left = j?.journal?.positions.filter((p) => !isReviewed(j.trades.get(p.ticket))) ?? []
  if (!j || !left.length) return null
  // Positions are newest first.
  const day = left[0].day
  const onDay = left.filter((p) => p.day === day).length
  return (
    <section aria-label="To review" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border bg-card p-5 shadow-card">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/15" aria-hidden>
        <Layers className="size-5 text-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{plural(onDay, "trade")} from {relativeDay(day, j.tz)} to review</p>
        <p className="text-sm text-muted-foreground">
          One swipe for each trade: right if you followed your plan, left if not.
          {left.length > onDay && ` ${left.length - onDay} more on older days.`}
        </p>
      </div>
      <Button onClick={() => j.review(day)} className="w-full sm:w-auto">Review {relativeDay(day, j.tz)}</Button>
    </section>
  )
}
