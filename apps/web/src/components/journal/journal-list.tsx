import * as React from "react"
import { ChevronDown, Layers, NotebookPen } from "lucide-react"
import { SessionStrip } from "@/components/charts/day-timeline"
import { pillGroup, pillItem } from "@/components/dashboard/filter-bar"
import { Panel } from "@/components/dashboard/panel"
import { SideBadge } from "@/components/dashboard/side-badge"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useJournalContext } from "@/hooks/use-journal"
import type { Position, TradeReview } from "@/lib/api/types"
import { formatMonth, money, plural, pnlClass } from "@/lib/format"
import { MOODS, RISKS, isReviewed, moodOf } from "@/lib/journal"
import { cn } from "@/lib/utils"
import { PlanDot, RValue, ReviewBits } from "./review-bits"

const PAGE = 15
type Item = { p: Position; r: TradeReview }

/** Every day with a day review or a reviewed trade, newest first and grouped by month. Each day is one line with a
 *  picture of its trades; open it for the answers. Every plan. */
export function JournalList() {
  const j = useJournalContext()
  const [filter, setFilter] = React.useState("all")
  const [shown, setShown] = React.useState(PAGE)
  const journal = j?.journal

  const { days, byDay, positionsByDay, unreviewed, counts, offDays } = React.useMemo(() => {
    const reviews = new Map(journal?.trades.map((t) => [t.ticket, t]))
    const byDay = new Map<string, Item[]>()
    const positionsByDay = new Map<string, Position[]>()
    const unreviewed = new Map<string, number>()
    for (const p of [...(journal?.positions ?? [])].reverse()) {
      positionsByDay.set(p.day, [...(positionsByDay.get(p.day) ?? []), p])
      const r = reviews.get(p.ticket)
      if (r) byDay.set(p.day, [...(byDay.get(p.day) ?? []), { p, r }])
      if (!isReviewed(r)) unreviewed.set(p.day, (unreviewed.get(p.day) ?? 0) + 1)
    }
    const days = [...new Set([...(journal?.days.map((d) => d.day) ?? []), ...byDay.keys()])].sort().reverse()
    const counts = new Map<number, number>()
    for (const d of journal?.days ?? []) if (d.preMood) counts.set(d.preMood, (counts.get(d.preMood) ?? 0) + 1)
    const dayOff = new Map(journal?.days.map((d) => [d.day, d.followedPlan === false]))
    const offDays = new Set(days.filter((d) => dayOff.get(d) || byDay.get(d)?.some((i) => i.r.followedPlan === false)))
    return { days, byDay, positionsByDay, unreviewed, counts, offDays }
  }, [journal])

  if (!j) return null
  const visible = filter === "all" ? days : filter === "off" ? days.filter((d) => offDays.has(d)) : days.filter((d) => String(j.days.get(d)?.preMood) === filter)
  const page = visible.slice(0, shown)

  return (
    <Panel title="Journal" description="Your answers for each day and trade. Open a day to see them.">
      {!journal ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading your journal…</p>
      ) : !days.length ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <NotebookPen className="size-5 text-muted-foreground" aria-hidden />
          <p className="font-medium">No reviews yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Open a day on the calendar and select Review trades. One swipe for each trade.</p>
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

          {!page.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No days match this filter.</p>
          ) : (
            <div className="space-y-5">
              {months(page).map(([month, list]) => (
                <section key={month} aria-label={formatMonth(month, true)}>
                  <h4 className="sticky top-14 z-10 -mx-1 mb-1 bg-card/90 px-1 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
                    {formatMonth(month, true)}
                  </h4>
                  <ul className="divide-y">
                    {list.map((day) => (
                      <JournalDay key={day} day={day} items={byDay.get(day) ?? []} positions={positionsByDay.get(day) ?? []} left={unreviewed.get(day) ?? 0} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
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

/** Days split by month (yyyy-mm), order kept. */
function months(days: string[]) {
  const out: [string, string[]][] = []
  for (const d of days) {
    const m = d.slice(0, 7)
    if (out.at(-1)?.[0] === m) out.at(-1)![1].push(d)
    else out.push([m, [d]])
  }
  return out
}

function JournalDay({ day, items, positions, left }: { day: string; items: Item[]; positions: Position[]; left: number }) {
  const j = useJournalContext()!
  const [open, setOpen] = React.useState(false)
  const id = React.useId()
  const d = j.days.get(day)
  const stat = j.stats.get(day)
  const m = moodOf(d?.preMood)
  const risks = d?.risks.map((r) => RISKS.find((x) => x.value === r)?.label).filter(Boolean) ?? []
  const watch = d?.watchSetupIds.map((sid) => j.setups.get(sid)?.name).filter(Boolean) ?? []
  const date = new Date(day + "T00:00")
  const strip = React.useMemo(() => positions.map((p) => ({ ...p, id: p.ticket })), [positions])
  const offTrades = items.filter((i) => i.r.followedPlan === false).length

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => setOpen(!open)}
        className="group grid w-full cursor-pointer grid-cols-[2.75rem_minmax(0,1fr)_auto] items-start gap-3 rounded-lg py-3 text-left transition-colors hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="flex flex-col items-center leading-none" aria-hidden>
          <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{date.toLocaleDateString("en-US", { weekday: "short" })}</span>
          <span className="mt-1 font-display text-2xl font-semibold tabular-nums">{date.getDate()}</span>
        </span>
        <span className="min-w-0 space-y-1.5">
          <span className="sr-only">{date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.</span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm whitespace-nowrap">
            {m ? (
              <span className="inline-flex items-center gap-1"><span aria-hidden>{m.emoji}</span>{m.label}</span>
            ) : (
              <span className="text-muted-foreground">No check-in</span>
            )}
            {d?.followedPlan != null && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <PlanDot value={d.followedPlan} />
                {d.followedPlan ? "On plan" : "Off plan"}
              </span>
            )}
            {offTrades > 0 && <span className="text-xs text-loss">{offTrades} off plan</span>}
            {left > 0 && <span className="text-xs text-muted-foreground">{left} to review</span>}
          </span>
          {strip.length > 0 && <SessionStrip trades={strip} day={day} tz={j.tz} className="max-w-md" />}
          {d?.note && (
            // One note that grows from a one-line preview into the full text when the day opens.
            <span
              className={cn(
                "block overflow-hidden text-sm break-words whitespace-pre-line transition-[max-height,color] duration-300 ease-out",
                open ? "max-h-96 text-foreground" : "line-clamp-1 max-h-5 text-muted-foreground"
              )}
            >
              {d.note}
            </span>
          )}
        </span>
        <span className="flex items-start gap-2">
          {stat && (
            <span className="text-right">
              <span className={cn("block font-mono text-sm font-medium tabular-nums", pnlClass(stat.net))}>{stat.trades ? money(stat.net, true) : "—"}</span>
              <span className="block text-xs text-muted-foreground">{stat.trades ? plural(stat.trades, "trade") : "No trades"}</span>
            </span>
          )}
          <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden />
        </span>
      </button>

      {open && (
        <div id={`${id}-body`} className="space-y-3 pb-4 pl-[3.5rem]">
          {(risks.length > 0 || d?.noRisks || watch.length > 0) && (
            <dl className="grid gap-1 text-xs sm:grid-cols-[7rem_minmax(0,1fr)]">
              {(risks.length > 0 || d?.noRisks) && (
                <>
                  <dt className="text-muted-foreground">In the way</dt>
                  <dd className="flex flex-wrap gap-1">
                    {d?.noRisks ? <span>Nothing</span> : risks.map((r) => <span key={r} className="rounded-full border px-2 py-0.5">{r}</span>)}
                  </dd>
                </>
              )}
              {watch.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Watching</dt>
                  <dd>{watch.join(", ")}</dd>
                </>
              )}
            </dl>
          )}
          {items.length > 0 && (
            <ul className="space-y-1.5">
              {items.map((i) => <TradeItem key={i.p.ticket} {...i} />)}
            </ul>
          )}
          {left > 0 && (
            <Button variant="outline" size="sm" onClick={() => j.review(day)}>
              <Layers /> Review {plural(left, "trade")}
            </Button>
          )}
        </div>
      )}
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
