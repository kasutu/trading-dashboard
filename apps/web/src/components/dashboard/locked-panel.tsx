import { Check, Lock } from "lucide-react"
import { Link } from "wouter"
import { Button } from "@/components/ui/button"
import { FIRST_PAID } from "@/lib/plans"
import { cn } from "@/lib/utils"

type Props = {
  title: string
  /** What the user gets on a paid plan. */
  items: string[]
  className?: string
}

/** Shown on the Free plan in place of a paid view. Says what the view holds and links to the plans. */
export function LockedPanel({ title, items, className }: Props) {
  return (
    <section className={cn("flex flex-col items-start gap-4 min-w-0 rounded-xl border border-dashed bg-card p-5 sm:p-6", className)}>
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
        <Lock className="size-4 text-muted-foreground" />
      </span>
      <div>
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          This is part of {FIRST_PAID.name}, from ${FIRST_PAID.monthly} a month.
        </p>
      </div>
      <ul className="space-y-1.5 text-sm">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {i}
          </li>
        ))}
      </ul>
      <Button asChild variant="outline"><Link href="/pricing">See plans</Link></Button>
    </section>
  )
}
