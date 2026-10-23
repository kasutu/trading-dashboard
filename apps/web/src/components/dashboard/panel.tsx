import * as React from "react"
import { cn } from "@/lib/utils"
import { CardShareButton } from "./card-share"
import { toneClass, type Metric } from "./metrics"

export type { Metric }

type Props = {
  title: string
  description?: React.ReactNode
  /** The card's headline number. Shown large under the title; everything else stays quiet. */
  metric?: Metric
  /** Controls at the right of the title, such as a toggle. */
  action?: React.ReactNode
  children?: React.ReactNode
  className?: string
  /** Let the body grow to the panel height (for charts in a grid row). */
  fill?: boolean
  /** Show the share button. On by default. */
  share?: boolean
}

/** A titled card that holds one chart or table, with a button to share it as an image.
 *  With a `metric`: title, the number, its label and quiet stats, then the chart, then the description. */
export function Panel({ title, description, metric, action, children, className, fill, share = true }: Props) {
  const ref = React.useRef<HTMLElement>(null)
  const about = description && <p className="text-sm text-muted-foreground">{description}</p>
  return (
    <section ref={ref} className={cn("flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 shadow-card", className)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1 pt-0.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {!metric && about}
        </div>
        {(action || share) && (
          <div className="-mt-1.5 -mr-2 flex flex-none items-center gap-1 sm:-mt-1 sm:mr-0">
            {action}
            {share && <CardShareButton target={ref} title={title} />}
          </div>
        )}
      </header>
      {metric && <MetricBlock metric={metric} className="-mt-2" />}
      {children !== undefined && <div className={cn("min-w-0", fill && "flex flex-1 flex-col")}>{children}</div>}
      {metric && about}
    </section>
  )
}

/** The large number, its label and the quiet stats under it. */
export function MetricBlock({ metric: m, className, size = "md" }: { metric: Metric; className?: string; size?: "md" | "lg" }) {
  return (
    <div className={className}>
      <p
        className={cn(
          "font-display font-bold tracking-tight break-words tabular-nums",
          size === "lg" ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl",
          toneClass(m.tone)
        )}
      >
        {m.value}
      </p>
      {m.label && <p className="mt-1 text-sm text-muted-foreground">{m.label}</p>}
      {m.stats && m.stats.length > 0 && <Stats items={m.stats} className="mt-4" />}
    </div>
  )
}

/** Quiet label and value pairs: small muted labels, plain values. */
export function Stats({ items, className }: { items: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-8", className)}>
      {items.map(([label, value], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 text-sm tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
