import * as React from "react"
import { PnlBars } from "@/components/charts/pnl-bars"
import { pillGroup, pillItem } from "@/components/dashboard/filter-bar"
import { LockedPanel } from "@/components/dashboard/locked-panel"
import { Panel } from "@/components/dashboard/panel"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useJournalSummary } from "@/hooks/use-api"
import { useJournalContext } from "@/hooks/use-journal"
import type { JournalRow, Mood } from "@/lib/api/types"
import { money, pct, plural } from "@/lib/format"
import { formatR, moodOf } from "@/lib/journal"
import { cn } from "@/lib/utils"
import { RValue } from "./review-bits"

type View = "setup" | "grade" | "mistake" | "plan" | "mood"
const VIEWS: { value: View; label: string; about: string }[] = [
  { value: "setup", label: "Setup", about: "Net P&L of each setup." },
  { value: "grade", label: "Grade", about: "Whether your A setups beat your C setups." },
  { value: "mistake", label: "Mistakes", about: "What each mistake cost you: the net P&L of trades with it." },
  { value: "plan", label: "Plan", about: "Trades on plan against trades off plan." },
  { value: "mood", label: "Mood", about: "Net P&L of trading days by how you felt before trading." },
]

/** What the user gets on a paid plan, for the locked panel on Free. */
const LOCKED = [
  "P&L and win rate for each of your setups",
  "Whether your A setups beat your C setups",
  "What each mistake costs you",
  "On plan against off plan, and P&L by mood",
]

/** P&L by setup, grade, mistake, plan and mood, from the journal. The server computes it; paid plans only.
 *  A group shows in the chart once it has enough trades (days for moods). */
export function JournalInsights() {
  const j = useJournalContext()!
  const { data, error } = useJournalSummary(j.accountId, j.tz)
  const [view, setView] = React.useState<View>("setup")

  if (data?.locked) return <LockedPanel title="What your journal says" items={LOCKED} />

  const v = VIEWS.find((x) => x.value === view)!
  const days = view === "mood"
  const rows: JournalRow[] = !data
    ? []
    : { setup: data.bySetup, grade: data.byGrade, mistake: data.byMistake, plan: data.byPlan, mood: data.byMood }[view]
  const min = data ? (days ? data.minDays : data.minTrades) : 0
  const unit = days ? "day" : "trade"
  const name = (key: string) =>
    view === "setup" ? j.setups.get(key)?.name ?? "Unknown setup"
    : view === "mistake" ? j.mistakes.get(key)?.name ?? "Unknown mistake"
    : view === "grade" ? `${key} setups`
    : view === "plan" ? (key === "yes" ? "On plan" : "Off plan")
    : `${moodOf(Number(key) as Mood)?.emoji} ${moodOf(Number(key) as Mood)?.label}`
  const ready = rows.filter((r) => r.trades >= min).map((r) => ({ ...r, key: name(r.key), id: r.key }))
  // Headline: the costliest mistake, or the best setup, grade, plan answer or mood.
  const costly = view === "mistake"
  const top = ready.reduce<(typeof ready)[number] | undefined>((b, r) => (!b || (costly ? r.net < b.net : r.net > b.net) ? r : b), undefined)

  return (
    <Panel
      title="What your journal says"
      metric={top && { value: money(top.net, true), tone: top.net, label: `${costly ? "Costliest" : "Best"} · ${top.key}, ${plural(top.trades, unit)}` }}
      description={v.about}
    >
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="space-y-4">
        <ToggleGroup
          type="single"
          size="sm"
          spacing={1}
          className={cn(pillGroup, "max-w-full overflow-x-auto")}
          value={view}
          onValueChange={(x) => x && setView(x as View)}
          aria-label="Group by"
        >
          {VIEWS.map((x) => <ToggleGroupItem key={x.value} value={x.value} className={cn(pillItem, "px-2.5")}>{x.label}</ToggleGroupItem>)}
        </ToggleGroup>
        {!data ? (
          !error && <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            {ready.length ? (
              <PnlBars
                data={ready}
                vertical
                height={Math.max(120, ready.length * 40 + 40)}
                title={(d) => d.key}
                rows={(d) => [
                  ["Net P&L", money(d.net, true), d.net > 0 ? "text-profit" : d.net < 0 ? "text-loss" : undefined],
                  [days ? "Green days" : "Win rate", pct(d.winRate)],
                  [days ? "Days" : "Trades", d.trades],
                  ["Average R", d.avgR === null ? "—" : formatR(d.avgR)],
                ]}
              />
            ) : (
              <p className="rounded-lg bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
                {rows.length ? `A group shows here after ${plural(min, unit)}.` : "Nothing here yet. Review your trades to fill it in."}
              </p>
            )}
            {rows.length > 0 && (
              <ul className="divide-y text-sm">
                {rows.map((r) => {
                  const need = min - r.trades
                  return (
                    <li key={r.key} className="flex items-center gap-2 py-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{name(r.key)}</span>
                      {need > 0 ? (
                        <span className="shrink-0 text-xs text-muted-foreground">Needs {plural(need, `more ${unit}`)}</span>
                      ) : (
                        <>
                          <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{pct(r.winRate)}</span>
                          <span className="w-12 shrink-0 text-right text-xs">{r.avgR === null ? <span className="text-muted-foreground">—</span> : <RValue r={r.avgR} />}</span>
                          <span className={cn("w-24 shrink-0 text-right font-mono font-medium tabular-nums", r.net > 0 ? "text-profit" : r.net < 0 ? "text-loss" : "")}>{money(r.net, true)}</span>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              {days ? "Green days" : "Win rate"} · average R · net P&L. Only answered {unit}s count.
            </p>
          </>
        )}
      </div>
    </Panel>
  )
}
