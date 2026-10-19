import { reasonLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

// Static class map (Tailwind cannot see generated class names).
const TONE: Record<string, string> = {
  tp: "bg-profit/10 text-profit",
  sl: "bg-loss/10 text-loss",
  so: "bg-loss/15 text-loss font-semibold",
  user: "bg-muted text-muted-foreground",
}

/** How a trade closed, as a status pill. */
export function ReasonPill({ reason }: { reason: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", TONE[reason] ?? "bg-muted text-muted-foreground")}>
      {reasonLabel(reason)}
    </span>
  )
}
