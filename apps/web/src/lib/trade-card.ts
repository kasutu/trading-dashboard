import type { Candle, Side } from "@/lib/api/types"
import { money, price } from "@/lib/format"
import { formatR } from "@/lib/journal"
import { BODY, C, CARD_H, CARD_W, DISPLAY, FOOTER_H, MONO, PAD, drawBrand, drawFooter, startCard, text, tone, type Footer } from "./card-canvas"

export type TradeCardData = Footer & {
  symbol: string
  side: Side
  lots: number
  net: number
  /** Result in R, or null without a usable stop. */
  r: number | null
  entry: number
  exit: number
  /** "Mon, Sep 28 · 12:23 AM" */
  opened: string
  /** "2 min" */
  held: string
  /** Unix seconds. */
  openTs: number
  closeTs: number
  /** Candle length in seconds. */
  tfSec: number
  /** undefined while loading, null or empty when there are none. */
  candles: Candle[] | null | undefined
  /** Off: no dollar amounts or lot size, the result shows as R or the price move. */
  showAmounts: boolean
}

/** Price move in the trade's direction, in percent: "+0.42%". */
export function movePct(d: { side: Side; entry: number; exit: number }) {
  const m = ((d.exit - d.entry) / d.entry) * (d.side === "buy" ? 1 : -1) * 100
  return `${m > 0 ? "+" : m < 0 ? "−" : ""}${Math.abs(m).toFixed(2)}%`
}

/** The headline result: dollars when amounts are shown, else R, else the price move. */
export function headline(d: Pick<TradeCardData, "showAmounts" | "net" | "r" | "side" | "entry" | "exit">) {
  if (d.showAmounts) return money(d.net, true)
  return d.r !== null ? formatR(d.r) : movePct(d)
}

const CHART_X = 600 // left edge of the price chart

/** One trade as a 1200 × 630 image: symbol, side, result, prices, and a small price chart. */
export function drawTradeCard(canvas: HTMLCanvasElement, d: TradeCardData) {
  const ctx = startCard(canvas)
  drawBrand(ctx)
  text(ctx, d.opened, CARD_W - PAD, PAD + 22, `400 22px ${BODY}`, C.muted, "right")

  // Symbol, then a side tag and the size
  const sideColor = d.side === "buy" ? C.profit : C.loss
  text(ctx, d.symbol, PAD, 182, `700 48px ${DISPLAY}`, C.text)
  ctx.font = `700 48px ${DISPLAY}`
  let x = PAD + ctx.measureText(d.symbol).width + 18
  const sideText = d.side === "buy" ? "BUY" : "SELL"
  ctx.font = `700 17px ${BODY}`
  const tagW = ctx.measureText(sideText).width + 24
  ctx.beginPath()
  ctx.roundRect(x, 152, tagW, 32, 8)
  ctx.fillStyle = sideColor + "26"
  ctx.fill()
  text(ctx, sideText, x + tagW / 2, 174, `700 17px ${BODY}`, sideColor, "center")
  x += tagW + 14
  if (d.showAmounts) text(ctx, `${d.lots} lots`, x, 175, `400 22px ${BODY}`, C.muted)

  // Result
  const color = tone(d.net)
  text(ctx, headline(d), PAD, 290, `800 92px ${DISPLAY}`, color)
  const sub = d.showAmounts ? [d.r !== null ? formatR(d.r) : null, movePct(d)] : [d.r !== null ? movePct(d) : null]
  text(ctx, sub.filter(Boolean).join("  ·  "), PAD, 336, `500 24px ${MONO}`, C.muted)

  // Prices and hold time
  const top = 380
  ctx.fillStyle = C.line
  ctx.fillRect(PAD, top, CHART_X - PAD - 48, 1)
  const cols: [string, string][] = [["Entry", price(d.entry)], ["Exit", price(d.exit)], ["Held", d.held]]
  const colW = (CHART_X - PAD - 48) / cols.length
  cols.forEach(([label, value], i) => {
    const cx = PAD + i * colW
    text(ctx, label, cx, top + 44, `400 19px ${BODY}`, C.muted)
    text(ctx, value, cx, top + 82, `500 26px ${MONO}`, C.text)
  })

  drawChart(ctx, d, { x: CHART_X, y: 140, w: CARD_W - PAD - CHART_X, h: CARD_H - FOOTER_H - 36 - 140 })
  drawFooter(ctx, d)
}

type Box = { x: number; y: number; w: number; h: number }

/** Candles around the trade, the time it was open shaded, and the entry and exit marked. */
function drawChart(ctx: CanvasRenderingContext2D, d: TradeCardData, box: Box) {
  const candles = d.candles
  if (candles === undefined) {
    text(ctx, "Loading chart…", box.x + box.w / 2, box.y + box.h / 2, `400 18px ${BODY}`, C.muted, "center")
    return
  }
  if (!candles?.length) return drawFills(ctx, d, box)
  const lo0 = Math.min(d.entry, d.exit, ...candles.map((c) => c.low))
  const hi0 = Math.max(d.entry, d.exit, ...candles.map((c) => c.high))
  const padP = (hi0 - lo0) * 0.08 || hi0 * 0.001
  const lo = lo0 - padP
  const hi = hi0 + padP
  const slot = box.w / candles.length
  const t0 = candles[0].time
  const px = (t: number) => box.x + Math.min(Math.max(((t - t0) / d.tfSec + 0.5) * slot, 0), box.w)
  const py = (p: number) => box.y + box.h - ((p - lo) / (hi - lo)) * box.h

  // Time the trade was open
  const xo = px(d.openTs)
  const xc = px(d.closeTs)
  ctx.fillStyle = C.faint
  ctx.fillRect(xo, box.y, Math.max(xc - xo, 2), box.h)

  // Candles
  const body = Math.max(1, slot * 0.62)
  candles.forEach((c, i) => {
    const cx = box.x + (i + 0.5) * slot
    const up = c.close >= c.open
    ctx.fillStyle = ctx.strokeStyle = (up ? C.profit : C.loss) + "b3"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx, py(c.high))
    ctx.lineTo(cx, py(c.low))
    ctx.stroke()
    const top = py(Math.max(c.open, c.close))
    ctx.fillRect(cx - body / 2, top, body, Math.max(1, py(Math.min(c.open, c.close)) - top))
  })

  drawFills(ctx, d, box, xo, xc, py)
}

/** The entry level, a line from the entry to the exit, and the two dots. Without candles the
 *  entry and exit sit at fixed places in the box, so the card still shows the move. */
function drawFills(ctx: CanvasRenderingContext2D, d: TradeCardData, box: Box, xo?: number, xc?: number, py?: (p: number) => number) {
  if (!py) {
    const span = Math.abs(d.exit - d.entry) || d.entry * 0.001
    const lo = Math.min(d.entry, d.exit) - span * 0.6
    const hi = Math.max(d.entry, d.exit) + span * 0.6
    py = (p: number) => box.y + box.h - ((p - lo) / (hi - lo)) * box.h
    xo = box.x + box.w * 0.18
    xc = box.x + box.w * 0.82
    ctx.fillStyle = C.faint
    ctx.fillRect(xo, box.y, xc - xo, box.h)
  }
  xo = xo!
  xc = xc!
  const ye = py(d.entry)
  ctx.strokeStyle = C.level
  ctx.setLineDash([5, 6])
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(xo, ye)
  ctx.lineTo(box.x + box.w, ye)
  ctx.stroke()
  ctx.setLineDash([])
  const yx = py(d.exit)
  ctx.strokeStyle = tone(d.net) + "99"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(xo, ye)
  ctx.lineTo(xc, yx)
  ctx.stroke()
  dot(ctx, xo, ye, C.text, "Entry", ye > yx)
  dot(ctx, xc, yx, tone(d.net), "Exit", yx >= ye)
}

/** A filled dot with a ring in the card colour, labelled above or below. */
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: string, below: boolean) {
  ctx.beginPath()
  ctx.arc(x, y, 7, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = C.bg
  ctx.stroke()
  text(ctx, label, x, below ? y + 30 : y - 18, `600 15px ${BODY}`, color, "center")
}
