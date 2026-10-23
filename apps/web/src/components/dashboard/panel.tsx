import * as React from "react"
import { cn } from "@/lib/utils"
import { CardShareButton } from "./card-share"

type Props = {
  title: string
  description?: React.ReactNode
  /** Controls at the right of the title, such as a toggle. */
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Let the body grow to the panel height (for charts in a grid row). */
  fill?: boolean
  /** Show the share button. On by default. */
  share?: boolean
}

/** A titled card that holds one chart or table, with a button to share it as an image. */
export function Panel({ title, description, action, children, className, fill, share = true }: Props) {
  const ref = React.useRef<HTMLElement>(null)
  return (
    <section ref={ref} className={cn("flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-card", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {(action || share) && (
          <div className="flex items-center gap-1">
            {action}
            {share && <CardShareButton target={ref} title={title} />}
          </div>
        )}
      </header>
      <div className={cn(fill && "flex flex-1 flex-col")}>{children}</div>
    </section>
  )
}
