import * as React from "react"
import { Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Analytics, Filters } from "@/lib/api/types"
import { formatPeriod, money, pct } from "@/lib/format"
import { drawShareCard, type ShareData } from "@/lib/share-card"
import { shareFooter } from "@/lib/card-canvas"
import { ShareImageDialog } from "./share-image-dialog"

function shareData(a: Analytics, f: Filters, invite: boolean): ShareData {
  const s = a.summary
  return {
    ...shareFooter(f, invite),
    net: s.net,
    trades: s.trades,
    days: s.days,
    winRate: s.winRate,
    profitFactor: s.profitFactor,
    maxDd: s.maxDd,
    tradesPerDay: s.tradesPerDay,
    bestDay: Math.max(...a.daily.map((d) => d.net)),
    curve: a.curve.map((p) => p.equity),
    period: formatPeriod(a.period),
  }
}

/** Share button and dialog for the stats card. */
export function ShareDialog({ a, filters, footer }: { a: Analytics; filters: Filters; footer: boolean }) {
  const data = React.useMemo(() => shareData(a, filters, footer), [a, filters, footer])
  const draw = React.useCallback((canvas: HTMLCanvasElement) => drawShareCard(canvas, data), [data])
  const s = a.summary
  return (
    <ShareImageDialog
      trigger={<Button size="sm"><Share2 /> Share</Button>}
      title="Share your stats"
      description="Share the card, copy the caption or download the image. The card uses the current filters."
      draw={draw}
      caption={`My trading results for ${formatPeriod(a.period)}: ${money(s.net, true)} net P&L, ${pct(s.winRate, 1)} win rate. I track my trades with Jurno. Try it free at ${window.location.origin}`}
      fileName={`jurno-stats-${a.period[1]}.png`}
    />
  )
}
