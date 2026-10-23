import * as React from "react"
import { Share2 } from "lucide-react"
import { ShareImageDialog } from "@/components/dashboard/share-image-dialog"
import { shareFooter } from "@/lib/card-canvas"
import { Button } from "@/components/ui/button"
import { useMe } from "@/hooks/use-api"
import type { Filters, LocalTrade } from "@/lib/api/types"
import { drawCalendarCard, type CalendarCardData } from "@/lib/calendar-card"
import { monthOf, monthTitle } from "@/lib/calendar"
import { money, plural } from "@/lib/format"

type Props = { month: string; grid: string[]; byDay: Map<string, LocalTrade[]>; filters: Filters }

/** Share button for the month on screen. Draws it as a 1200 × 630 image, like the stats card. */
export function CalendarShare({ month, grid, byDay, filters }: Props) {
  const { data: me } = useMe()
  const invite = me?.plan !== "latte" && me?.plan !== "owner"

  const data = React.useMemo<CalendarCardData>(() => {
    const cells = grid.map((day) => {
      const trades = byDay.get(day) ?? []
      return {
        label: String(Number(day.slice(8))),
        inMonth: monthOf(day) === month,
        net: trades.reduce((s, t) => s + t.net, 0),
        trades: trades.length,
      }
    })
    const days = cells.filter((c) => c.inMonth && c.trades > 0)
    return {
      ...shareFooter(filters, invite),
      title: monthTitle(month),
      cells,
      net: days.reduce((s, c) => s + c.net, 0),
      trades: days.reduce((s, c) => s + c.trades, 0),
      green: days.filter((c) => c.net > 0).length,
      red: days.filter((c) => c.net < 0).length,
    }
  }, [month, grid, byDay, filters, invite])

  const draw = React.useCallback((canvas: HTMLCanvasElement) => drawCalendarCard(canvas, data), [data])
  const tradingDays = data.green + data.red

  return (
    <ShareImageDialog
      trigger={
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Share this month">
          <Share2 />
        </Button>
      }
      title="Share your calendar"
      description="Share this month as an image, copy the caption or download it. It uses the current filters."
      draw={draw}
      caption={`My ${data.title} trading calendar: ${money(data.net, true)} net P&L over ${plural(tradingDays, "trading day")} (${data.green} green, ${data.red} red). I track my trades with Jurno. Try it free at ${window.location.origin}`}
      fileName={`jurno-calendar-${month}.png`}
    />
  )
}
