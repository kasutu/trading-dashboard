import { PnlBars } from "@/components/charts/pnl-bars"
import { LockedPanel } from "@/components/dashboard/locked-panel"
import { Panel } from "@/components/dashboard/panel"
import { useJournalSummary } from "@/hooks/use-api"
import { useJournalContext } from "@/hooks/use-journal"
import { money, pct, plural, pnlClass } from "@/lib/format"
import { moodOf } from "@/lib/journal"
import { cn } from "@/lib/utils"

/** Average daily net P&L and win rate for each mood. The server computes it; paid plans only. */
export function MoodPnl() {
  const j = useJournalContext()!
  const { data, error } = useJournalSummary(j.accountId, j.tz)

  if (data?.locked)
    return <LockedPanel title="P&L by mood" items={["Your average daily P&L for each mood", "Your win rate on good days and bad days"]} />

  const ready = data?.byMood.filter((r) => r.days >= data.minDays) ?? []
  const rows = ready.map((r) => ({ ...r, key: `${moodOf(r.mood)!.emoji} ${moodOf(r.mood)!.label}`, net: r.avgPerDay, total: r.net }))

  return (
    <Panel title="P&L by mood" description="Average net P&L on trading days you logged each mood.">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!data ? (
        !error && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          {rows.length ? (
            <PnlBars
              data={rows}
              height={200}
              title={(d) => d.key}
              rows={(d) => [
                ["Average per day", money(d.avgPerDay, true), pnlClass(d.avgPerDay)],
                ["Green days", pct(d.winRate)],
                ["Days", d.days],
                ["Net P&L", money(d.total, true), pnlClass(d.total)],
              ]}
            />
          ) : (
            <p className="rounded-lg bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
              A mood shows here after {data.minDays} trading days with it.
            </p>
          )}
          <ul className="divide-y text-sm">
            {data.byMood.map((r) => {
              const m = moodOf(r.mood)!
              const need = data.minDays - r.days
              return (
                <li key={r.mood} className="flex items-center gap-2 py-2">
                  <span aria-hidden className="text-base leading-none">{m.emoji}</span>
                  <span className="font-medium">{m.label}</span>
                  {need > 0 ? (
                    <span className="ml-auto text-xs text-muted-foreground">Needs {plural(need, "more day")}</span>
                  ) : (
                    <>
                      <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{pct(r.winRate)} green</span>
                      <span className={cn("w-24 text-right font-mono font-medium tabular-nums", pnlClass(r.avgPerDay))}>{money(r.avgPerDay, true)}</span>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-muted-foreground">Average per day · share of green days.</p>
        </div>
      )}
    </Panel>
  )
}
