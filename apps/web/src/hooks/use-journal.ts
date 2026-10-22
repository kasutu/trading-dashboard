import * as React from "react"
import type { DayEntry, Journal, JournalDayStat, JournalInput, JournalTrade } from "@/lib/api/types"

export type JournalTarget = { day: string } | { ticket: string }

export type JournalState = {
  accountId: string
  /** The dashboard timezone. Day entries are keyed by the day in this timezone. */
  tz: string
  /** Undefined while loading. */
  journal?: Journal
  days: Map<string, DayEntry>
  trades: Map<string, JournalTrade>
  stats: Map<string, JournalDayStat>
  save: (target: JournalTarget, input: JournalInput) => Promise<void>
}

/** Provided by JournalProvider around the dashboard, so the calendar, day sheet, trade list and Notes share one fetch. */
export const JournalContext = React.createContext<JournalState | null>(null)

/** The journal of the dashboard's account, or null outside the dashboard. */
export const useJournalContext = () => React.useContext(JournalContext)
