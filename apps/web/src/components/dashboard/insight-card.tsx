import * as React from "react"
import type { Insight } from "@/lib/insights"
import { cn } from "@/lib/utils"
import { CardShareButton } from "./card-share"
import { InsightViz } from "./insight-viz"

const TONE = { good: "text-profit", bad: "text-loss", info: "text-foreground" } as const

/** One note: title, key figure, small chart and a plain explanation, with a button to share it. */
export function InsightCard({ insight: i, share = true }: { insight: Insight; share?: boolean }) {
  const ref = React.useRef<HTMLElement>(null)
  return (
    <article ref={ref} className="flex min-w-0 flex-col rounded-xl border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <p className="pt-0.5 text-sm font-semibold">{i.title}</p>
        {share && <CardShareButton target={ref} title={i.title} className="-mt-1.5 -mr-2 sm:-mt-1 sm:mr-0" />}
      </div>
      <p className={cn("mt-1 font-display text-3xl font-bold tracking-tight", TONE[i.tone])}>{i.figure}</p>
      {i.viz && <div className="mt-3"><InsightViz viz={i.viz} /></div>}
      <p className="mt-auto pt-3 text-sm text-muted-foreground">{i.detail}</p>
    </article>
  )
}
