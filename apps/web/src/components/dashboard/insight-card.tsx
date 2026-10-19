import type { Insight } from "@/lib/insights"
import { cn } from "@/lib/utils"
import { InsightViz } from "./insight-viz"

const TONE = { good: "text-profit", bad: "text-loss", info: "text-foreground" } as const

/** One note: title, key figure, small chart and a plain explanation. */
export function InsightCard({ insight: i }: { insight: Insight }) {
  return (
    <article className="flex flex-col rounded-xl border bg-card p-5 shadow-card">
      <p className="text-sm text-muted-foreground">{i.title}</p>
      <p className={cn("mt-1 font-display text-2xl font-bold", TONE[i.tone])}>{i.figure}</p>
      {i.viz && <div className="mt-3"><InsightViz viz={i.viz} /></div>}
      <p className="mt-auto pt-3 text-sm text-muted-foreground">{i.detail}</p>
    </article>
  )
}
