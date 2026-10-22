import { Check } from "lucide-react"
import type { SaveState } from "@/hooks/use-autosave"
import { cn } from "@/lib/utils"

/** "Saving…", "Saved" or the error, quietly, next to a title. */
export function SaveStatus({ state, className }: { state: SaveState; className?: string }) {
  return (
    <span role="status" className={cn("flex min-h-5 items-center gap-1 text-xs text-muted-foreground", className)}>
      {state.kind === "saving" && "Saving…"}
      {state.kind === "saved" && <><Check className="size-3.5 text-profit" aria-hidden /> Saved</>}
      {state.kind === "error" && <span className="text-destructive">{state.message}</span>}
    </span>
  )
}
