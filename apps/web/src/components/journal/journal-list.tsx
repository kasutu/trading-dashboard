import * as React from "react"
import { Layers, NotebookPen } from "lucide-react"
import { pillGroup, pillItem } from "@/components/dashboard/filter-bar"
import { Panel } from "@/components/dashboard/panel"
import { SideBadge } from "@/components/dashboard/side-badge"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useJournalContext } from "@/hooks/use-journal"
import type { Position, TradeReview } from "@/lib/api/types"
import { money, plural, pnlClass, relativeDay } from "@/lib/format"
import { MOODS, RISKS, isReviewed, moodOf } from "@/lib/journal"
import { cn } from "@/lib/utils"
import { PlanDot, RValue, ReviewBits } from "./review-bits"

const PAGE = 15
type Item = { p: Position; r: TradeReview }

/** Every day with a day review or a reviewed trade, newest first, with its reviewed trades. Every plan. */
export function JournalList() {
  const j = useJournalContext()
  const [filter, setFilter] = React.useState("all")
  const [shown, setShown] = React.useState(PAGE)
  const journal = j?.journal

  const { days, byDay, unreviewed, latest, counts, offDays } = React.useMemo(() => {
    const reviews = new Map(journal?.trades.map((t) => [t.ticket, t]))
    const byDay = new Map<string, Item[]>()
    const unreviewed = new Map<string, number>()
    for (const p of [...(journal?.positions ?? [])].reverse()) {
      const r = reviews.get(p.ticket)
      if (r) byDay.set(p.day, [...(byDay.get(p.day) ?? []), { p, r }])
      if (!isReviewed(r)) unreviewed.set(p.day, (unreviewed.get(p.day) ?? 0) + 1)
    }
    const days = [...new Set([...(journal?.days.map((d) => d.day) ?? []), ...byDay.keys()])].sort().reverse()
    const counts = new Map<number, number>()
    for (const d of journal?.days ?? []) if (d.preMood) counts.set(d.preMood, (counts.get(d.preMood) ?? 0) + 1)
    const dayOff = new Map(journal?.days.map((d) => [d.day, d.followedPlan === false]))
    const offDays = new Set(days.filter((d) => dayOff.get(d) || byDay.get(d)?.some((i) => i.r.followedPlan === false)))
    // The newest day with a trade still to review.
    const latest = journal?.positions.find((p) => !isReviewed(reviews.get(p.ticket)))?.day
    return { days, byDay, unreviewed, latest, counts, offDays }
  }, [journal])

  if (!j) return null
  const visible = filter === "all" ? days : filter === "off" ? days.filter((d) => offDays.has(d)) : days.filter((d) => String(j.days.get(d)?.preMood) === filter)

  return (
    <Panel
      title="Journal"
      description="Your answers for each day and trade."
      action={
        latest && (
          <Button size="sm" onClick={() => j.review(latest)}>
            <Layers /> Review {relativeDay(latest, j.tz)}
            <span className="font-mono tabular-nums opacity-70">{unreviewed.get(latest)}</span>
          </Button>
        )
      }
    >
      {!journal ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading your journal…</p>
      ) : !days.length ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <NotebookPen className="size-5 text-muted-foreground" aria-hidden />
          <p className="font-medium">No reviews yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Click a day on the calendar and Review trades. It takes a swipe per trade.</p>
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
            aria-label="Filter days"
          >
            <ToggleGroupItem value="all" className={pillItem}>All</ToggleGroupItem>
            <ToggleGroupItem value="off" className={cn(pillItem, "gap-1.5")} aria-label={`Off plan, ${plural(offDays.size, "day")}`}>
              <span aria-hidden className="size-1.5 rounded-full bg-loss" />
              <span aria-hidden>Off plan</span>
            </ToggleGroupItem>
            {MOODS.map((m) => (
              <ToggleGroupItem key={m.value} value={String(m.value)} className={cn(pillItem, "gap-1 px-2 sm:px-2.5")} aria-label={`${m.label}, ${plural(counts.get(m.value) ?? 0, "day")}`}>
                <span aria-hidden className="text-sm">{m.emoji}</span>
                <span aria-hidden>{counts.get(m.value) ?? 0}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {!visible.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No days like this yet.</p>
          ) : (
            <ul className="divide-y">
              {visible.slice(0, shown).map((day) => (
                <JournalDay key={day} day={day} items={byDay.get(day) ?? []} left={unreviewed.get(day) ?? 0} />
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

function JournalDay({ day, items, left }: { day: string; items: Item[]; left: number }) {
  const j = useJournalContext()!
  const d = j.days.get(day)
  const stat = j.stats.get(day)
  const m = moodOf(d?.preMood)
  const risks = d?.risks.map((r) => RISKS.find((x) => x.value === r)?.label).filter(Boolean) ?? []
  const watch = d?.watchSetupIds.map((id) => j.setups.get(id)?.name).filter(Boolean) ?? []

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
          {d && (risks.length > 0 || d.noRisks || watch.length > 0 || d.followedPlan !== null) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {d.followedPlan !== null && (
                <span className="inline-flex items-center gap-1.5 pr-1">
                  <PlanDot value={d.followedPlan} /> {d.followedPlan ? "Stuck to the plan" : "Off plan"}
                </span>
              )}
              {risks.map((r) => <span key={r} className="rounded-full border px-2 py-0.5">{r}</span>)}
              {d.noRisks && <span className="rounded-full border px-2 py-0.5">Nothing in the way</span>}
              {watch.length > 0 && <span className="truncate">Watching {watch.join(", ")}</span>}
            </div>
          )}
          {d?.note && <p className="mt-1.5 text-sm break-words whitespace-pre-line">{d.note}</p>}
          {items.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {items.map((i) => <TradeItem key={i.p.ticket} {...i} />)}
            </ul>
          )}
          {left > 0 && (
            <button
              type="button"
              onClick={() => j.review(day)}
              className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Layers className="size-3.5" aria-hidden /> {plural(left, "trade")} to review
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

function TradeItem({ p, r }: Item) {
  return (
    <li className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{p.symbol}</span>
        <SideBadge side={p.side} />
        <span className="ml-auto flex items-baseline gap-2">
          <RValue r={p.r} className="text-xs" />
          <span className={cn("font-mono font-medium tabular-nums", pnlClass(p.net))}>{money(p.net, true)}</span>
        </span>
      </div>
      <ReviewBits review={r} chips className="mt-1.5" />
      {r.note && <p className="mt-1 break-words whitespace-pre-line text-muted-foreground">{r.note}</p>}
    </li>
  )
}
