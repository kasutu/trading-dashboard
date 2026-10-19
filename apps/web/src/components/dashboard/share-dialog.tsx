import * as React from "react"
import { Check, Copy, Download, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import type { Analytics, Filters } from "@/lib/api/types"
import { formatPeriod } from "@/lib/format"
import { canvasToPng, drawShareCard, loadCardFonts, type ShareData } from "@/lib/share-card"

function shareData(a: Analytics, f: Filters, footer: boolean): ShareData {
  const s = a.summary
  return {
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
    context: [
      f.symbol === "all" ? "All symbols" : f.symbol,
      f.side === "all" ? "Buy and sell" : f.side === "buy" ? "Buy only" : "Sell only",
    ].join(" · "),
    footer,
  }
}

/** Share button and a dialog with a PNG stats card to copy or download. */
export function ShareDialog({ a, filters, footer }: { a: Analytics; filters: Filters; footer: boolean }) {
  const [canvas, setCanvas] = React.useState<HTMLCanvasElement | null>(null)
  const [status, setStatus] = React.useState<"idle" | "copied" | "error">("idle")
  const data = React.useMemo(() => shareData(a, filters, footer), [a, filters, footer])

  React.useEffect(() => {
    if (!canvas) return
    let live = true
    loadCardFonts().then(() => live && drawShareCard(canvas, data))
    return () => { live = false }
  }, [canvas, data])

  const copy = async () => {
    try {
      // Pass a promise so Safari keeps the click as the user gesture.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": canvasToPng(canvas!) })])
      setStatus("copied")
    } catch {
      setStatus("error")
    }
    setTimeout(() => setStatus("idle"), 2500)
  }

  const download = async () => {
    const url = URL.createObjectURL(await canvasToPng(canvas!))
    const link = Object.assign(document.createElement("a"), { href: url, download: `jurno-stats-${a.period[1]}.png` })
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog onOpenChange={() => setStatus("idle")}>
      <DialogTrigger asChild>
        <Button size="sm"><Share2 /> Share</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <div className="space-y-1 pr-6">
          <DialogTitle className="font-display text-lg font-bold">Share your stats</DialogTitle>
          <DialogDescription>The card uses the current filters. Copy it or download it as a PNG file.</DialogDescription>
        </div>
        <canvas ref={setCanvas} className="aspect-[1200/630] w-full rounded-lg border" aria-label="Stats card preview" />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {status === "error" && (
            <p role="alert" className="mr-auto text-sm text-destructive">This browser cannot copy images. Download the file.</p>
          )}
          <Button variant="outline" onClick={copy}>
            {status === "copied" ? <><Check /> Copied</> : <><Copy /> Copy image</>}
          </Button>
          <Button onClick={download}><Download /> Download PNG</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
