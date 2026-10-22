import * as React from "react"
import type { DayReview, DayReviewFields, TradeReview, TradeReviewFields } from "@/lib/api/types"
import { useAutosave } from "./use-autosave"
import { useJournalContext } from "./use-journal"

export const BLANK_TRADE: TradeReviewFields = {
  followedPlan: null, setupId: null, grade: null, mood: null, mistakeIds: [], noMistakes: false, initialStop: null, initialTarget: null, note: null,
}
export const BLANK_DAY: DayReviewFields = { preMood: null, risks: [], noRisks: false, watchSetupIds: [], followedPlan: null, note: null }

const tradeFields = (r: TradeReview | undefined): TradeReviewFields => {
  if (!r) return BLANK_TRADE
  const { ticket: _t, updatedAt: _u, ...f } = r
  return f
}
const dayFields = (d: DayReview | undefined): DayReviewFields => {
  if (!d) return BLANK_DAY
  const { day: _d, updatedAt: _u, ...f } = d
  return f
}

/** The server's answers, except text that only differs by the spaces the server trims (so a pause in typing
 *  does not eat the space just typed). */
function merge<T extends object>(local: T, server: T): T {
  const out = { ...server }
  for (const k of Object.keys(local) as (keyof T)[]) {
    const l = local[k]
    if (typeof l === "string" && (l.trim() || null) === server[k]) out[k] = l
  }
  return out
}

/** Answers held locally so taps show at once, saved as they are given. When nothing is waiting to be saved,
 *  answers saved elsewhere (another editor of the same trade or day) are taken in. */
function useAnswers<T extends object>(server: T, stamp: string, save: (patch: Partial<T>) => Promise<unknown>) {
  const [v, setV] = React.useState(server)
  const [seen, setSeen] = React.useState(stamp)
  const auto = useAutosave<T>(save)
  if (stamp !== seen) {
    setSeen(stamp)
    // While saving, a refetch can be older than the answers on screen, so keep them.
    if (auto.idle) setV((local) => merge(local, server))
  }
  const set = (patch: Partial<T>, when: "now" | "later" = "now") => {
    setV((prev) => ({ ...prev, ...patch }))
    if (when === "now") auto.now(patch)
    else auto.later(patch)
  }
  return { v, set, state: auto.state, flush: auto.flush }
}

/** The review of one position, by ticket. */
export function useTradeAnswers(ticket: string) {
  const j = useJournalContext()!
  const r = j.trades.get(ticket)
  return useAnswers(tradeFields(r), r?.updatedAt ?? "", (patch) => j.saveTrade(ticket, patch))
}

/** The review of one day. */
export function useDayAnswers(day: string) {
  const j = useJournalContext()!
  const d = j.days.get(day)
  return useAnswers(dayFields(d), d?.updatedAt ?? "", (patch) => j.saveDay(day, patch))
}

export type TradeAnswers = ReturnType<typeof useTradeAnswers>
export type DayAnswers = ReturnType<typeof useDayAnswers>
