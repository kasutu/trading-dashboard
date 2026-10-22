import * as React from "react"
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type AutoscaleInfo,
  type IChartApi,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type ISeriesPrimitive,
  type IPriceLine,
  type SeriesAttachedParameter,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts"
import type { Candle, LocalTrade, Timeframe } from "@/lib/api/types"
import { formatDateTime, money, price } from "@/lib/format"
import { tfSeconds } from "@/lib/timeframes"
import { cn } from "@/lib/utils"

type Palette = { text: string; muted: string; grid: string; profit: string; loss: string; shade: string; font: string }

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

/** Shades the time the trade was open, behind the candles. */
class HoldWindow implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null
  private series: ISeriesApi<"Candlestick"> | null = null
  private requestUpdate?: () => void
  private span: { open: number; close: number; sec: number } | null = null
  private color = "transparent"
  private x: [number, number] | null = null
  private readonly view: IPrimitivePaneView
  private readonly renderer: IPrimitivePaneRenderer

  constructor() {
    this.renderer = {
      draw: () => {},
      drawBackground: (target) => {
        const x = this.x
        if (!x) return
        target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio: r }) => {
          context.fillStyle = this.color
          const left = Math.round(x[0] * r)
          context.fillRect(left, 0, Math.max(1, Math.round(x[1] * r) - left), bitmapSize.height)
        })
      },
    }
    this.view = { zOrder: () => "bottom", renderer: () => this.renderer }
  }

  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
    this.chart = chart as IChartApi
    this.series = series as ISeriesApi<"Candlestick">
    this.requestUpdate = requestUpdate
  }
  detached() {
    this.chart = this.series = null
  }
  set(span: { open: number; close: number; sec: number } | null, color: string) {
    this.span = span
    this.color = color
    this.requestUpdate?.()
  }
  updateAllViews() {
    this.x = null
    const ts = this.chart?.timeScale()
    if (!ts || !this.span || !this.series) return
    const { open, close, sec } = this.span
    const a = ts.logicalToCoordinate(0 as never)
    const b = ts.logicalToCoordinate(1 as never)
    if (a === null || b === null) return
    const spacing = b - a
    // A candle is drawn centered on its start time and covers [start, start + sec).
    const at = (s: number) => {
      const bar = Math.floor(s / sec) * sec
      const x = ts.timeToCoordinate(bar as UTCTimestamp)
      return x === null ? null : x + ((s - bar) / sec - 0.5) * spacing
    }
    const x0 = at(open)
    const x1 = at(close)
    if (x0 !== null && x1 !== null) this.x = [x0, x1]
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
    markers: ISeriesMarkersPluginApi<Time>
    hold: HoldWindow
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
    const markers = createSeriesMarkers(series, [], { zOrder: "aboveSeries" })
    const hold = new HoldWindow()
    series.attachPrimitive(hold)
    parts.current = { chart, series, markers, hold, lines: [] }
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
    const bar = (iso: string) => (Math.floor(Date.parse(iso) / 1000 / sec) * sec) as UTCTimestamp
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
    const markers: SeriesMarker<Time>[] = [
      {
        time: bar(trade.open),
        position: buy ? "belowBar" : "aboveBar",
        shape: buy ? "arrowUp" : "arrowDown",
        color: palette.text,
        text: `${buy ? "Buy" : "Sell"} ${trade.lots} @ ${price(trade.openPrice)}`,
      },
      {
        time: bar(trade.close),
        position: buy ? "aboveBar" : "belowBar",
        shape: buy ? "arrowDown" : "arrowUp",
        color: result,
        text: money(trade.net, true),
      },
    ]
    p.markers.setMarkers(markers.sort((a, b) => (a.time as number) - (b.time as number)))

    for (const line of p.lines) p.series.removePriceLine(line)
    const line = (value: number | null, color: string, title: string, lineStyle: LineStyle) =>
      value === null ? [] : [p.series.createPriceLine({ price: value, color, title, lineStyle, lineWidth: 1, axisLabelVisible: true })]
    p.lines = [
      ...line(trade.sl, palette.loss, "SL", LineStyle.Dashed),
      ...line(trade.tp, palette.profit, "TP", LineStyle.Dashed),
      ...line(trade.openPrice, palette.muted, "Entry", LineStyle.Dashed),
      ...line(trade.closePrice, result, "Exit", LineStyle.Dotted),
    ]

    p.hold.set({ open: Date.parse(trade.open) / 1000, close: Date.parse(trade.close) / 1000, sec }, palette.shade)
    p.chart.timeScale().fitContent()
  }, [trade, candles, tf, palette])

  return <div ref={box} className={cn("h-[260px] w-full sm:h-[360px]", className)} />
}
