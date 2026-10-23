import * as React from "react"
import { Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useCandles, useMe } from "@/hooks/use-api"
import { useJournalContext } from "@/hooks/use-journal"
import { useSettings } from "@/hooks/use-settings"
import type { LocalTrade } from "@/lib/api/types"
import { duration, formatDay, formatTime, reasonLabel } from "@/lib/format"
import { rFrom } from "@/lib/journal"
import { candleWindow, pickTimeframe, tfSeconds } from "@/lib/timeframes"
import { drawTradeCard, headline, movePct, type TradeCardData } from "@/lib/trade-card"
import { cn } from "@/lib/utils"
import { ShareImageDialog } from "./share-image-dialog"

type Props = { accountId: string; trade: LocalTrade; tz: string; className?: string }

/** Icon button that shares one trade as an image. Prices load only when it is opened. */
export function TradeShareButton({ className, ...props }: Props) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn("text-muted-foreground", className)}
        onClick={() => setOpen(true)}
        aria-label="Share this trade"
        title="Share this trade"
      >
        <Share2 />
      </Button>
      {open && <TradeShareDialog {...props} onClose={() => setOpen(false)} />}
    </>
  )
}

/** The stop to measure R from: the starting stop from the review, else the file's stop when it is on the loss side. */
function stopFor(t: LocalTrade, initialStop: number | null | undefined) {
  if (initialStop != null) return initialStop
  if (t.sl === null) return null
  return (t.side === "buy" ? t.sl < t.openPrice : t.sl > t.openPrice) ? t.sl : null
}

function TradeShareDialog({ accountId, trade: t, tz, onClose }: Props & { onClose: () => void }) {
  const { data: me } = useMe()
  const journal = useJournalContext()
  const { settings, update } = useSettings()
  const [tf, setTf] = React.useState(() => pickTimeframe(t.durationMin))
  const range = React.useMemo(() => candleWindow(t.open, t.close, tf), [t.open, t.close, tf])
  const { data: fetched, error } = useCandles(accountId, t.symbol, tf, range)
  // Far back, TradingView may only have longer candles than asked for, and the window sized for the
  // short ones then holds only a few. Ask again with the window sized for the length that came back.
  const coarser = fetched && fetched.tf !== tf ? fetched.tf : null
  if (coarser) setTf(coarser) // during render, React's pattern for state that follows a value
  const candles = coarser ? undefined : fetched

  const review = journal?.trades.get(t.ticket)
  const setup = review?.setupId ? journal?.setups.get(review.setupId)?.name : undefined
  const context = [setup, review?.grade && `Grade ${review.grade}`].filter(Boolean).join(" · ") || `Closed by ${reasonLabel(t.reason).toLowerCase()}`

  const data = React.useMemo<TradeCardData>(
    () => ({
      context,
      invite: me?.plan !== "latte" && me?.plan !== "owner",
      site: window.location.host,
      symbol: t.symbol,
      side: t.side,
      lots: t.lots,
      net: t.net,
      r: rFrom(t, stopFor(t, review?.initialStop)),
      entry: t.openPrice,
      exit: t.closePrice,
      opened: `${formatDay(t.day, true)} · ${formatTime(t.open, tz)}`,
      held: duration(t.durationMin),
      openTs: Date.parse(t.open) / 1000,
      closeTs: Date.parse(t.close) / 1000,
      tfSec: tfSeconds(candles?.tf ?? tf),
      candles: candles ? candles.candles : error ? null : undefined,
      showAmounts: settings.shareAmounts,
    }),
    [t, tz, me?.plan, context, review?.initialStop, candles, error, tf, settings.shareAmounts]
  )
  const draw = React.useCallback((canvas: HTMLCanvasElement) => drawTradeCard(canvas, data), [data])

  const side = t.side === "buy" ? "Long" : "Short"
  const result = headline(data)
  const extra = data.showAmounts && data.r !== null ? ` (${headline({ ...data, showAmounts: false })})` : data.showAmounts ? ` (${movePct(data)})` : ""

  return (
    <ShareImageDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Share this trade"
      description="Share the trade as an image, copy the caption or download it."
      controls={
        <div className="flex items-center gap-3">
          <Switch id="share-amounts" checked={settings.shareAmounts} onCheckedChange={(v) => update({ shareAmounts: v })} />
          <Label htmlFor="share-amounts" className="font-normal">
            Show amounts
            <span className="text-muted-foreground"> · dollar result and lot size</span>
          </Label>
        </div>
      }
      draw={draw}
      caption={`${side} ${t.symbol}: ${result}${extra} in ${data.held}. I journal my trades with Jurno: ${window.location.origin}`}
      fileName={`jurno-trade-${t.symbol}-${t.ticket}.png`}
    />
  )
}
