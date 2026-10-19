import { Badge } from "@/components/ui/badge"
import type { Side } from "@/lib/api/types"
import { cn } from "@/lib/utils"

export function SideBadge({ side, className }: { side: Side; className?: string }) {
  return (
    <Badge variant="outline" className={cn(side === "buy" ? "text-profit" : "text-loss", className)}>
      {side === "buy" ? "Buy" : "Sell"}
    </Badge>
  )
}
