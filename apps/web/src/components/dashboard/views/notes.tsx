import { InsightCard } from "@/components/dashboard/insight-card"
import type { Insight } from "@/lib/insights"

const GROUPS = [
  { tone: "bad", title: "What hurts", dot: "bg-loss" },
  { tone: "good", title: "What helps", dot: "bg-profit" },
  { tone: "info", title: "Worth a look", dot: "bg-muted-foreground" },
] as const

/** All notes, one card each, grouped by whether they help or hurt. */
export function Notes({ insights }: { insights: Insight[] }) {
  if (!insights.length)
    return (
      <div className="rounded-xl border border-dashed bg-card py-16 text-center">
        <p className="font-medium">No notes yet</p>
        <p className="mt-1 text-sm text-muted-foreground">Notes show after 10 or more trades.</p>
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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((i) => <InsightCard key={i.title} insight={i} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}
