import type { Me } from "@/lib/api/types"
import { planName } from "@/lib/plans"
import { cn } from "@/lib/utils"

const STYLE: Record<Me["plan"], string> = {
  free: "border-border text-muted-foreground",
  espresso: "border-brand/50 bg-brand/15 text-foreground",
  latte: "border-brand/50 bg-brand/15 text-foreground",
  owner: "border-foreground bg-foreground text-background",
}

/** The user's plan as a small pill. */
export function PlanBadge({ plan, className }: { plan: Me["plan"]; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none", STYLE[plan], className)}>
      {planName(plan)}
    </span>
  )
}
