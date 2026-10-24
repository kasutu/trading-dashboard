import { InsightCard } from "@/components/dashboard/insight-card"
import { LockedPanel } from "@/components/dashboard/locked-panel"
import type { Insight } from "@/lib/insights"

const GROUPS = [
  { tone: "bad", title: "Stop doing", dot: "bg-loss" },
  { tone: "good", title: "Keep doing", dot: "bg-profit" },
  { tone: "info", title: "Try this", dot: "bg-muted-foreground" },
] as const

/** What the automatic notes hold, for the locked panel on the Free plan. */
const LOCKED = ["When to trade and when to avoid it", "What to stop doing and what to keep doing, with a chart for each"]

/** The automatic advice (paid plans), grouped by what to stop, keep and try. */
export function Notes({ insights, locked }: { insights: Insight[]; locked: boolean }) {
  return locked ? <LockedPanel title="What to do" items={LOCKED} /> : <Insights insights={insights} />
}

/** All automatic notes, one card each, grouped by whether they help or hurt. */
function Insights({ insights }: { insights: Insight[] }) {
  if (!insights.length)
    return (
      <div className="rounded-xl border border-dashed bg-card py-16 text-center">
        <p className="font-medium">No advice yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Import 10 or more trades.</p>
      </div>
    )
  return (
    <div className="space-y-8">
      {GROUPS.map((g) => {
        const items = insights.filter((i) => i.tone === g.tone)
        if (!items.length) return null
        return (
          <section key={g.tone} className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <span className={`size-2 rounded-full ${g.dot}`} aria-hidden />
              {g.title}
              <span className="font-normal text-muted-foreground">{items.length}</span>
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((i) => <InsightCard key={i.title} insight={i} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}
