import * as React from "react"
import { NotebookPen } from "lucide-react"
import { pillGroup, pillItem } from "@/components/dashboard/filter-bar"
import { Panel } from "@/components/dashboard/panel"
import { SideBadge } from "@/components/dashboard/side-badge"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useJournalContext } from "@/hooks/use-journal"
import type { JournalTrade } from "@/lib/api/types"
import { money, plural, pnlClass, relativeDay } from "@/lib/format"
import { MOODS, moodOf } from "@/lib/journal"
import { cn } from "@/lib/utils"

const PAGE = 15

/** Every day with a mood or note, newest first, with that day's trade notes under it. Free on every plan. */
export function JournalList() {
  const j = useJournalContext()
  const [filter, setFilter] = React.useState("all")
  const [shown, setShown] = React.useState(PAGE)
  const journal = j?.journal

  const { days, byDay, counts } = React.useMemo(() => {
    const byDay = new Map<string, JournalTrade[]>()
    for (const t of journal?.trades ?? []) if (t.position) byDay.set(t.position.day, [...(byDay.get(t.position.day) ?? []), t])
    const days = [...new Set([...(journal?.days.map((d) => d.day) ?? []), ...byDay.keys()])].sort().reverse()
    const counts = new Map<number, number>()
    for (const d of journal?.days ?? []) if (d.mood) counts.set(d.mood, (counts.get(d.mood) ?? 0) + 1)
    return { days, byDay, counts }
  }, [journal])

  if (!j) return null
  const visible = filter === "all" ? days : days.filter((d) => String(j.days.get(d)?.mood) === filter)

  return (
    <Panel title="Journal" description="Your mood and notes for each day and trade.">
      {!journal ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading your journal…</p>
      ) : !days.length ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <NotebookPen className="size-5 text-muted-foreground" aria-hidden />
          <p className="font-medium">No entries yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Click a day on the calendar, or the note icon in the Trades tab, to add how it went.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <ToggleGroup
            type="single"
            size="sm"
            spacing={1}
            className={cn(pillGroup, "max-w-full overflow-x-auto")}
            value={filter}
            onValueChange={(v) => {
              if (!v) return
              setFilter(v)
              setShown(PAGE)
            }}
            aria-label="Filter by mood"
          >
            <ToggleGroupItem value="all" className={pillItem}>All</ToggleGroupItem>
            {MOODS.map((m) => (
              <ToggleGroupItem key={m.value} value={String(m.value)} className={cn(pillItem, "gap-1 px-2 sm:px-2.5")} aria-label={`${m.label}, ${plural(counts.get(m.value) ?? 0, "day")}`}>
                <span aria-hidden className="text-sm">{m.emoji}</span>
                <span aria-hidden>{counts.get(m.value) ?? 0}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {!visible.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No days with this mood yet.</p>
          ) : (
            <ul className="divide-y">
              {visible.slice(0, shown).map((day) => (
                <JournalDayItem key={day} day={day} trades={byDay.get(day) ?? []} />
              ))}
            </ul>
          )}
          {visible.length > shown && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => setShown(shown + PAGE)}>
              Show more <span className="text-muted-foreground">({visible.length - shown})</span>
            </Button>
          )}
        </div>
      )}
    </Panel>
  )
}

function JournalDayItem({ day, trades }: { day: string; trades: JournalTrade[] }) {
  const j = useJournalContext()!
  const entry = j.days.get(day)
  const stat = j.stats.get(day)
  const m = moodOf(entry?.mood)

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xl leading-none">
          {m?.emoji ?? <NotebookPen className="size-4 text-muted-foreground" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="text-sm font-medium">{relativeDay(day, j.tz)}</p>
            {m && <p className="text-xs text-muted-foreground">{m.label}</p>}
            {stat && (
              <p className="ml-auto shrink-0 text-right text-xs text-muted-foreground">
                <span className={cn("font-mono text-sm font-medium tabular-nums", pnlClass(stat.net))}>{stat.trades ? money(stat.net, true) : ""}</span>
                <span className="block sm:ml-2 sm:inline">{stat.trades ? plural(stat.trades, "trade") : "No trades"}</span>
              </p>
            )}
          </div>
          {entry?.note && <p className="mt-1 text-sm break-words whitespace-pre-line">{entry.note}</p>}
          {trades.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {trades.map((t) => <TradeItem key={t.ticket} t={t} />)}
            </ul>
          )}
        </div>
      </div>
    </li>
  )
}

function TradeItem({ t }: { t: JournalTrade }) {
  const m = moodOf(t.mood)
  const p = t.position!
  return (
    <li className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{p.symbol}</span>
        <SideBadge side={p.side} />
        {m && <span className="text-xs text-muted-foreground"><span aria-hidden>{m.emoji}</span> {m.label}</span>}
        <span className={cn("ml-auto font-mono font-medium tabular-nums", pnlClass(p.net))}>{money(p.net, true)}</span>
      </div>
      {t.note && <p className="mt-1 break-words whitespace-pre-line text-muted-foreground">{t.note}</p>}
    </li>
  )
}
