import * as React from "react"
import type { Insight } from "@/lib/insights"
import { cn } from "@/lib/utils"
import { CardShareButton } from "./card-share"
import { InsightViz } from "./insight-viz"

const TONE = { good: "text-profit", bad: "text-loss", info: "text-foreground" } as const

/** One note: title, key figure, small chart and a plain explanation, with a button to share it. */
export function InsightCard({ insight: i }: { insight: Insight }) {
  const ref = React.useRef<HTMLElement>(null)
  return (
    <article ref={ref} className="flex flex-col rounded-xl border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{i.title}</p>
        <CardShareButton target={ref} title={i.title} />
      </div>
      <p className={cn("mt-1 font-display text-2xl font-bold", TONE[i.tone])}>{i.figure}</p>
      {i.viz && <div className="mt-3"><InsightViz viz={i.viz} /></div>}
      <p className="mt-auto pt-3 text-sm text-muted-foreground">{i.detail}</p>
    </article>
  )
}
