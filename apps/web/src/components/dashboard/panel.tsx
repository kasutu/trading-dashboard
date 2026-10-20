import type * as React from "react"
import { cn } from "@/lib/utils"

type Props = {
  title: string
  description?: React.ReactNode
  /** Controls at the right of the title, such as a toggle. */
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** Let the body grow to the panel height (for charts in a grid row). */
  fill?: boolean
}

/** A titled card that holds one chart or table. */
export function Panel({ title, description, action, children, className, fill }: Props) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-card", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      <div className={cn(fill && "flex flex-1 flex-col")}>{children}</div>
    </section>
  )
}
