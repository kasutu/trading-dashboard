import { cn } from "@/lib/utils"
import { MARK } from "./mark"

/** Mark and wordmark. `compact` hides the wordmark on small screens. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden>
        <path d={MARK.spine} className="fill-brand" />
        <path d={MARK.outline} className="stroke-foreground" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={cn("font-display text-lg font-bold tracking-tight", compact && "hidden sm:inline")}>Jurno</span>
    </span>
  )
}
