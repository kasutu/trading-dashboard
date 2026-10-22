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

export type Level = "sl" | "tp"
/** Stop loss and take profit to draw. Null hides the line. */
export type Levels = Record<Level, number | null>

type Props = {
  trade: LocalTrade
  candles: Candle[]
  tf: Timeframe
  tz: string
  /** Defaults to the trade's own SL and TP. */
  levels?: Levels
  /** Makes the SL and TP lines draggable. Called with the new price when a drag ends. */
  onLevel?: (level: Level, price: number) => void
  className?: string
}

/** Pixels from a line that still grab it. */
const GRAB = 6

/** Candlesticks around one trade, with where it was entered and exited, its stop loss and take
 *  profit, and the time it was open shaded. Lightweight Charts by TradingView. */
export function TradeChart({ trade, candles, tf, tz, levels: given, onLevel, className }: Props) {
  const box = React.useRef<HTMLDivElement>(null)
  const parts = React.useRef<{
    chart: IChartApi
    series: ISeriesApi<"Candlestick">
    overlay: TradeOverlay
    lines: IPriceLine[]
    levels: Partial<Record<Level, IPriceLine>>
  } | null>(null)
  const palette = usePalette()
  const levels = given ?? { sl: trade.sl, tp: trade.tp }
  // Read by the autoscale and the drag handlers, which outlive a render.
  const live = React.useRef({ levels, onLevel, trade })
  React.useEffect(() => { live.current = { levels, onLevel, trade } })

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
    parts.current = { chart, series, overlay, lines: [], levels: {} }
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

  // Candles, the A to B path and the entry and exit labels. Fits the view, so it runs only when the trade or candles change.
  React.useEffect(() => {
    const p = parts.current
    if (!p) return
    const sec = tfSeconds(tf)
    const digits = digitsOf(trade)
    p.series.applyOptions({
      priceFormat: { type: "price", precision: digits, minMove: 10 ** -digits },
      // Keep the stop loss and take profit lines on screen, even when the candles never reach them.
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const r = original()
        if (!r?.priceRange) return r
        const { sl, tp } = live.current.levels
        const all = [trade.openPrice, trade.closePrice, sl, tp].filter((n): n is number => n !== null)
        const { minValue, maxValue } = r.priceRange
        return { ...r, priceRange: { minValue: Math.min(minValue, ...all), maxValue: Math.max(maxValue, ...all) } }
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
    // Entry and exit: axis labels only. The A to B line shows them on the chart.
    p.lines = [
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

  // Stop loss and take profit lines. Their own effect, so moving one keeps the zoom.
  React.useEffect(() => {
    const p = parts.current
    if (!p) return
    for (const k of ["sl", "tp"] as const) {
      const value = levels[k]
      const old = p.levels[k]
      if (value === null) {
        if (old) p.series.removePriceLine(old)
        delete p.levels[k]
        continue
      }
      const opts = {
        price: value,
        color: k === "sl" ? palette.loss : palette.profit,
        title: k === "sl" ? "SL" : "TP",
        lineStyle: onLevel ? LineStyle.Solid : LineStyle.Dashed,
        lineWidth: 1 as const,
        axisLabelVisible: true,
      }
      if (old) old.applyOptions(opts)
      else p.levels[k] = p.series.createPriceLine(opts)
    }
  }, [levels.sl, levels.tp, palette, onLevel]) // eslint-disable-line react-hooks/exhaustive-deps

  // Drag the SL or TP line up and down. The chart does not pan while a line is held.
  React.useEffect(() => {
    const el = box.current
    if (!el || !onLevel) return
    let held: { level: Level; id: number } | null = null
    const yOf = (e: PointerEvent) => e.clientY - el.getBoundingClientRect().top
    const near = (y: number): Level | null => {
      const p = parts.current
      if (!p) return null
      for (const k of ["sl", "tp"] as const) {
        const v = live.current.levels[k]
        const ly = v === null ? null : p.series.priceToCoordinate(v)
        if (ly !== null && Math.abs(ly - y) <= GRAB) return k
      }
      return null
    }
    /** The price under the pointer, kept on the right side of the entry and rounded to the price digits. */
    const priceAt = (level: Level, y: number) => {
      const p = parts.current!
      const t = live.current.trade
      const raw = p.series.coordinateToPrice(y)
      if (raw === null) return null
      const digits = digitsOf(t)
      const step = 10 ** -digits
      const below = (level === "sl") === (t.side === "buy")
      const v = below ? Math.min(raw, t.openPrice - step) : Math.max(raw, t.openPrice + step)
      return +Math.max(step, v).toFixed(digits)
    }
    const down = (e: PointerEvent) => {
      const level = near(yOf(e))
      if (!level) return
      // Capture phase on the box: the chart below never sees the press, so it does not pan.
      e.preventDefault()
      e.stopPropagation()
      held = { level, id: e.pointerId }
      el.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!held) {
        el.style.cursor = near(yOf(e)) ? "ns-resize" : ""
        return
      }
      if (e.pointerId !== held.id) return
      e.stopPropagation()
      const v = priceAt(held.level, yOf(e))
      if (v !== null) parts.current?.levels[held.level]?.applyOptions({ price: v })
    }
    const up = (e: PointerEvent) => {
      if (!held || e.pointerId !== held.id) return
      e.stopPropagation()
      const v = priceAt(held.level, yOf(e))
      const level = held.level
      held = null
      if (v !== null) live.current.onLevel?.(level, v)
    }
    el.addEventListener("pointerdown", down, true)
    el.addEventListener("pointermove", move, true)
    el.addEventListener("pointerup", up, true)
    el.addEventListener("pointercancel", up, true)
    return () => {
      el.removeEventListener("pointerdown", down, true)
      el.removeEventListener("pointermove", move, true)
      el.removeEventListener("pointerup", up, true)
      el.removeEventListener("pointercancel", up, true)
      el.style.cursor = ""
    }
  }, [!!onLevel]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} className={cn("h-[260px] w-full sm:h-[360px]", className)} />
}
