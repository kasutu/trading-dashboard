import * as React from "react"
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  createChart,
  type AutoscaleInfo,
  type IChartApi,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesPrimitive,
  type IPriceLine,
  type SeriesAttachedParameter,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts"
import type { Candle, LocalTrade, Timeframe } from "@/lib/api/types"
import { formatDateTime, money, price } from "@/lib/format"
import { tfSeconds } from "@/lib/timeframes"
import { cn } from "@/lib/utils"

type Palette = { text: string; muted: string; grid: string; profit: string; loss: string; shade: string; buy: string; card: string; font: string }

/** Any CSS color as the canvas writes it back (#rrggbb or rgba()), which Lightweight Charts can parse. */
function canvasColor(css: string, alpha = 1) {
  const ctx = document.createElement("canvas").getContext("2d")!
  ctx.fillStyle = css
  ctx.globalAlpha = 1
  const c = ctx.fillStyle
  if (alpha === 1 || !c.startsWith("#")) return c
  const n = parseInt(c.slice(1), 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** The app's color tokens for the current theme. */
function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    text: canvasColor(v("--foreground")),
    muted: canvasColor(v("--muted-foreground")),
    grid: canvasColor(v("--border")),
    profit: canvasColor(v("--profit")),
    loss: canvasColor(v("--loss")),
    shade: canvasColor(v("--foreground"), 0.05),
    // MT5 draws buys in blue. The app's blue (also used for deposits).
    buy: canvasColor(v("--deposit")),
    card: canvasColor(v("--card")),
    font: getComputedStyle(document.body).fontFamily,
  }
}

/** The palette, read again whenever the theme class on <html> changes. */
function usePalette() {
  const [palette, setPalette] = React.useState(readPalette)
  React.useEffect(() => {
    const observer = new MutationObserver(() => setPalette(readPalette()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] })
    return () => observer.disconnect()
  }, [])
  return palette
}

/** Where the trade sits on the chart: open (A) and close (B) as time and price. */
type Path = { open: number; close: number; openPrice: number; closePrice: number; buy: boolean; sec: number; labels: [string, string] }
type Style = { shade: string; buy: string; sell: string; text: string; result: string; card: string; font: string }

/** MT5-style trade history: the time the trade was open shaded behind the candles, a triangle on each deal at its
 *  exact time and price (blue up for a buy deal, red down for a sell deal), and a dashed line from A to B in the
 *  color of the position. */
class TradeOverlay implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null
  private series: ISeriesApi<"Candlestick"> | null = null
  private requestUpdate?: () => void
  private path: Path | null = null
  private style: Style = { shade: "transparent", buy: "blue", sell: "red", text: "black", result: "black", card: "white", font: "sans-serif" }
  /** Screen points of A and B, from the last update. */
  private pts: { a: { x: number; y: number }; b: { x: number; y: number } } | null = null
  private readonly view: IPrimitivePaneView
  private readonly renderer: IPrimitivePaneRenderer

  constructor() {
    this.renderer = {
      drawBackground: (target) => {
        const p = this.pts
        if (!p) return
        target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio: r }) => {
          context.fillStyle = this.style.shade
          const left = Math.round(p.a.x * r)
          context.fillRect(left, 0, Math.max(1, Math.round(p.b.x * r) - left), bitmapSize.height)
        })
      },
      draw: (target) => {
        const p = this.pts
        const path = this.path
        if (!p || !path) return
        target.useBitmapCoordinateSpace(({ context: c, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
          const ax = p.a.x * hr, ay = p.a.y * vr, bx = p.b.x * hr, by = p.b.y * vr
          c.save()
          c.lineWidth = Math.max(1, Math.round(hr))
          c.strokeStyle = path.buy ? this.style.buy : this.style.sell
          c.setLineDash([4 * hr, 3 * hr])
          c.beginPath()
          c.moveTo(ax, ay)
          c.lineTo(bx, by)
          c.stroke()
          c.setLineDash([])
          // The entry deal has the position's side; the exit deal is the opposite side.
          this.deal(c, ax, ay, path.buy, hr)
          this.deal(c, bx, by, !path.buy, hr)
          // A's label to the left of A, B's to the right of B, each on its triangle's side; flipped at the edges.
          c.font = `${11 * hr}px ${this.style.font}`
          c.textBaseline = path.buy ? "top" : "bottom"
          const gap = 8 * hr
          const text = (t: string, x: number, y: number, left: boolean, color: string) => {
            const w = c.measureText(t).width
            const flip = left ? x - gap - w < 0 : x + gap + w > c.canvas.width
            const tx = left !== flip ? x - gap - w : x + gap
            const pad = 3 * hr
            const lh = 14 * vr
            const top = c.textBaseline === "top" ? y : y - lh
            // A card-colored pill behind the text, so candles do not run through it.
            c.fillStyle = this.style.card
            c.globalAlpha = 0.9
            c.beginPath()
            c.roundRect(tx - pad, top - pad / 2, w + pad * 2, lh + pad, 4 * hr)
            c.fill()
            c.globalAlpha = 1
            c.textAlign = "left"
            c.fillStyle = color
            c.fillText(t, tx, y)
          }
          text(path.labels[0], ax, ay + (path.buy ? 2 : -2) * vr, true, this.style.text)
          c.textBaseline = path.buy ? "bottom" : "top"
          text(path.labels[1], bx, by + (path.buy ? -2 : 2) * vr, false, this.style.result)
          c.restore()
        })
      },
    }
    this.view = { zOrder: () => "top", renderer: () => this.renderer }
  }

  /** A deal triangle with its tip on the price: pointing up from below for a buy, down from above for a sell. */
  private deal(c: CanvasRenderingContext2D, x: number, y: number, buy: boolean, r: number) {
    const w = 5 * r, h = 7 * r, dir = buy ? 1 : -1
    c.fillStyle = buy ? this.style.buy : this.style.sell
    c.beginPath()
    c.moveTo(x, y)
    c.lineTo(x - w, y + dir * h)
    c.lineTo(x + w, y + dir * h)
    c.closePath()
    c.fill()
  }

  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
    this.chart = chart as IChartApi
    this.series = series as ISeriesApi<"Candlestick">
    this.requestUpdate = requestUpdate
  }
  detached() {
    this.chart = this.series = null
  }
  set(path: Path | null, style: Style) {
    this.path = path
    this.style = style
    this.requestUpdate?.()
  }
  updateAllViews() {
    this.pts = null
    const ts = this.chart?.timeScale()
    const series = this.series
    if (!ts || !this.path || !series) return
    const { open, close, openPrice, closePrice, sec } = this.path
    const a = ts.logicalToCoordinate(0 as never)
    const b = ts.logicalToCoordinate(1 as never)
    if (a === null || b === null) return
    const spacing = b - a
    // A candle is drawn centered on its start time and covers [start, start + sec).
    const at = (t: number) => {
      const bar = Math.floor(t / sec) * sec
      const x = ts.timeToCoordinate(bar as UTCTimestamp)
      return x === null ? null : x + ((t - bar) / sec - 0.5) * spacing
    }
    const x0 = at(open), x1 = at(close)
    const y0 = series.priceToCoordinate(openPrice), y1 = series.priceToCoordinate(closePrice)
    if (x0 !== null && x1 !== null && y0 !== null && y1 !== null) this.pts = { a: { x: x0, y: y0 }, b: { x: x1, y: y1 } }
  }
  paneViews() {
    return [this.view]
  }
}

/** Digits to show: enough for every price on the trade, between 2 and 5. */
function digitsOf(t: LocalTrade) {
  const d = (n: number | null) => (n === null ? 0 : (price(n).split(".")[1] ?? "").length)
  return Math.min(5, Math.max(2, d(t.openPrice), d(t.closePrice), d(t.sl), d(t.tp)))
}

type Props = { trade: LocalTrade; candles: Candle[]; tf: Timeframe; tz: string; className?: string }

/** Candlesticks around one trade, with where it was entered and exited, its stop loss and take
 *  profit, and the time it was open shaded. Lightweight Charts by TradingView. */
export function TradeChart({ trade, candles, tf, tz, className }: Props) {
  const box = React.useRef<HTMLDivElement>(null)
  const parts = React.useRef<{
    chart: IChartApi
    series: ISeriesApi<"Candlestick">
    overlay: TradeOverlay
    lines: IPriceLine[]
  } | null>(null)
  const palette = usePalette()

  // Create the chart once; remove it on unmount.
  React.useEffect(() => {
    const chart = createChart(box.current!, {
      autoSize: true,
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: { vertTouchDrag: false },
      rightPriceScale: { scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 2 },
    })
    const series = chart.addSeries(CandlestickSeries, { priceLineVisible: false, lastValueVisible: false })
    const overlay = new TradeOverlay()
    series.attachPrimitive(overlay)
    parts.current = { chart, series, overlay, lines: [] }
    return () => {
      parts.current = null
      chart.remove()
    }
  }, [])

  // Colors, fonts and time labels.
  React.useEffect(() => {
    const p = parts.current
    if (!p) return
    const at = (time: Time, opts: Intl.DateTimeFormatOptions) =>
      new Date((time as number) * 1000).toLocaleString("en-US", { timeZone: tz, ...opts })
    p.chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: palette.muted,
        fontFamily: palette.font,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: palette.grid, style: LineStyle.Dashed } },
      rightPriceScale: { borderColor: palette.grid },
      timeScale: {
        borderColor: palette.grid,
        tickMarkFormatter: (time: Time, type: TickMarkType) =>
          type === TickMarkType.Year ? at(time, { year: "numeric" })
          : type === TickMarkType.Month ? at(time, { month: "short" })
          : type === TickMarkType.DayOfMonth ? at(time, { month: "short", day: "numeric" })
          : at(time, { hour: "numeric", minute: "2-digit" }),
      },
      localization: {
        locale: "en-US",
        timeFormatter: (time: Time) =>
          tf === "1d"
            ? at(time, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
            : formatDateTime(new Date((time as number) * 1000).toISOString(), tz),
      },
      crosshair: {
        vertLine: { color: palette.muted, labelBackgroundColor: palette.text },
        horzLine: { color: palette.muted, labelBackgroundColor: palette.text },
      },
    })
    p.series.applyOptions({
      upColor: palette.profit,
      downColor: palette.loss,
      borderUpColor: palette.profit,
      borderDownColor: palette.loss,
      wickUpColor: palette.profit,
      wickDownColor: palette.loss,
    })
  }, [palette, tz, tf])

  // Candles, markers and price lines.
  React.useEffect(() => {
    const p = parts.current
    if (!p) return
    const sec = tfSeconds(tf)
    const digits = digitsOf(trade)
    // Keep the stop loss and take profit lines on screen, even when the candles never reach them.
    const levels = [trade.openPrice, trade.closePrice, trade.sl, trade.tp].filter((n): n is number => n !== null)
    p.series.applyOptions({
      priceFormat: { type: "price", precision: digits, minMove: 10 ** -digits },
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const r = original()
        if (!r?.priceRange) return r
        const { minValue, maxValue } = r.priceRange
        return { ...r, priceRange: { minValue: Math.min(minValue, ...levels), maxValue: Math.max(maxValue, ...levels) } }
      },
    })
    p.series.setData(candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })))

    const buy = trade.side === "buy"
    const result = trade.net >= 0 ? palette.profit : palette.loss

    for (const line of p.lines) p.series.removePriceLine(line)
    const line = (value: number | null, color: string, title: string, lineVisible = true) =>
      value === null
        ? []
        : [p.series.createPriceLine({ price: value, color, title, lineStyle: LineStyle.Dashed, lineWidth: 1, lineVisible, axisLabelVisible: true })]
    p.lines = [
      ...line(trade.sl, palette.loss, "SL"),
      ...line(trade.tp, palette.profit, "TP"),
      // Entry and exit: axis labels only. The A to B line shows them on the chart.
      ...line(trade.openPrice, palette.muted, "A", false),
      ...line(trade.closePrice, result, "B", false),
    ]

    p.overlay.set(
      {
        open: Date.parse(trade.open) / 1000,
        close: Date.parse(trade.close) / 1000,
        openPrice: trade.openPrice,
        closePrice: trade.closePrice,
        buy,
        sec,
        labels: [`A  ${buy ? "Buy" : "Sell"} ${trade.lots} @ ${price(trade.openPrice)}`, `B  ${price(trade.closePrice)}  ${money(trade.net, true)}`],
      },
      { shade: palette.shade, buy: palette.buy, sell: palette.loss, text: palette.text, result, card: palette.card, font: palette.font }
    )
    p.chart.timeScale().fitContent()
  }, [trade, candles, tf, palette])

  return <div ref={box} className={cn("h-[260px] w-full sm:h-[360px]", className)} />
}
