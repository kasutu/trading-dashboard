import * as React from "react"
import { saveJournal, useJournal } from "@/hooks/use-api"
import { JournalContext, type JournalState } from "@/hooks/use-journal"

/** Loads the account's journal once and shares it with everything below. */
export function JournalProvider({ accountId, tz, children }: { accountId: string; tz: string; children: React.ReactNode }) {
  const { data } = useJournal(accountId, tz)
  const value = React.useMemo<JournalState>(
    () => ({
      accountId,
      tz,
      journal: data,
      days: new Map(data?.days.map((d) => [d.day, d])),
      trades: new Map(data?.trades.map((t) => [t.ticket, t])),
      stats: new Map(data?.stats.map((s) => [s.day, s])),
      save: (target, input) => saveJournal(accountId, target, input),
    }),
    [accountId, tz, data]
  )
  return <JournalContext value={value}>{children}</JournalContext>
}
