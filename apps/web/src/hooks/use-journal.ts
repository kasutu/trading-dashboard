import * as React from "react"
import type {
  DayReview, DayReviewInput, Journal, JournalDayStat, JournalTags, MistakeTag, Position, Setup, TradeReview, TradeReviewInput,
} from "@/lib/api/types"

export type JournalState = {
  accountId: string
  /** The dashboard timezone. Days are keyed by the day in this timezone. */
  tz: string
  /** Undefined while loading. */
  journal?: Journal
  /** Undefined while loading. Archived ones included. */
  tags?: JournalTags
  positions: Map<string, Position>
  trades: Map<string, TradeReview>
  days: Map<string, DayReview>
  stats: Map<string, JournalDayStat>
  setups: Map<string, Setup>
  mistakes: Map<string, MistakeTag>
  saveTrade: (ticket: string, input: TradeReviewInput) => Promise<unknown>
  saveDay: (day: string, input: DayReviewInput) => Promise<unknown>
  /** Opens the review card stack for a day. */
  review: (day: string) => void
}

/** Provided by JournalProvider around the dashboard, so the calendar, day sheet, trade list and Notes share one fetch. */
export const JournalContext = React.createContext<JournalState | null>(null)

/** The journal of the dashboard's account, or null outside the dashboard. */
export const useJournalContext = () => React.useContext(JournalContext)
