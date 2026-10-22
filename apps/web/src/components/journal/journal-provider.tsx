import * as React from "react"
import { saveDayReview, saveTradeReview, useJournal, useJournalTags } from "@/hooks/use-api"
import { JournalContext, type JournalState } from "@/hooks/use-journal"
import { ReviewFlow } from "./review-flow"

/** Loads the account's journal and the person's tags once and shares them with everything below.
 *  Also holds the review card stack, so the day sheet and the Notes tab can open it. */
export function JournalProvider({ accountId, tz, children }: { accountId: string; tz: string; children: React.ReactNode }) {
  const { data } = useJournal(accountId, tz)
  const { data: tags } = useJournalTags()
  const [reviewDay, setReviewDay] = React.useState<string | null>(null)
  const value = React.useMemo<JournalState>(
    () => ({
      accountId,
      tz,
      journal: data,
      tags,
      positions: new Map(data?.positions.map((p) => [p.ticket, p])),
      trades: new Map(data?.trades.map((t) => [t.ticket, t])),
      days: new Map(data?.days.map((d) => [d.day, d])),
      stats: new Map(data?.stats.map((s) => [s.day, s])),
      setups: new Map(tags?.setups.map((s) => [s.id, s])),
      mistakes: new Map(tags?.mistakes.map((m) => [m.id, m])),
      saveTrade: (ticket, input) => saveTradeReview(accountId, ticket, input),
      saveDay: (day, input) => saveDayReview(accountId, day, input),
      review: setReviewDay,
    }),
    [accountId, tz, data, tags]
  )
  return (
    <JournalContext value={value}>
      {children}
      <ReviewFlow day={reviewDay} onClose={() => setReviewDay(null)} />
    </JournalContext>
  )
}
