import { MARK } from "@/components/brand/mark"
import { money, pct } from "@/lib/format"

export type ShareData = {
  net: number
  trades: number
  days: number
  winRate: number
  /** null = infinite */
  profitFactor: number | null
  maxDd: number
  tradesPerDay: number
  bestDay: number
  /** Cumulative net P&L, one value per closed trade. */
  curve: number[]
  period: string
  context: string
}

export const CARD_W = 1200
export const CARD_H = 630
const SCALE = 2 // render at 2x for sharp text

// The card always uses the dark theme so it looks the same wherever it is posted.
const C = {
  bg: "#111823",
  line: "rgba(255,255,255,0.09)",
  text: "#e8edf3",
  muted: "#8c97a6",
  brand: "#f2bf3a",
  profit: "#3cc398",
  loss: "#f06a5d",
}
const DISPLAY = '"Schibsted Grotesk", "Geist", sans-serif'
const BODY = '"Geist", system-ui, sans-serif'
const MONO = '"Geist Mono", ui-monospace, monospace'
const PAD = 64
const TAG_COL = 132 // right column for the high and low value tags

const tone = (n: number) => (n > 0 ? C.profit : n < 0 ? C.loss : C.text)

/** Wait for the web fonts, or the canvas falls back to system fonts. */
export async function loadCardFonts() {
  await Promise.all(
    [`800 100px ${DISPLAY}`, `700 30px ${DISPLAY}`, `400 24px ${BODY}`, `500 30px ${MONO}`].map((f) =>
      document.fonts.load(f).catch(() => null)
    )
  )
}

export function drawShareCard(canvas: HTMLCanvasElement, d: ShareData) {
  canvas.width = CARD_W * SCALE
  canvas.height = CARD_H * SCALE
  const ctx = canvas.getContext("2d")!
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = "alphabetic"

  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // Header: mark, wordmark, period
  ctx.save()
  ctx.translate(PAD, PAD - 6)
  ctx.scale(40 / 24, 40 / 24)
  ctx.fillStyle = C.brand
  ctx.fill(new Path2D(MARK.spine))
  ctx.strokeStyle = C.text
  ctx.lineWidth = 2
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.stroke(new Path2D(MARK.outline))
  ctx.restore()
  text(ctx, "Jurno", PAD + 52, PAD + 24, `700 30px ${DISPLAY}`, C.text)
  text(ctx, d.period, CARD_W - PAD, PAD + 22, `400 22px ${BODY}`, C.muted, "right")

  // Hero: net P&L, with a short brand bar above the label
  ctx.fillStyle = C.brand
  ctx.beginPath()
  ctx.roundRect(PAD, 158, 40, 5, 2.5)
  ctx.fill()
  text(ctx, "Net P&L", PAD, 196, `400 24px ${BODY}`, C.muted)
  const netText = money(d.net, true)
  ctx.font = `800 100px ${DISPLAY}`
  const w = ctx.measureText(netText).width
  text(ctx, netText, PAD, 290, `800 100px ${DISPLAY}`, tone(d.net))
  text(ctx, `${d.trades} trades on ${d.days} days`, PAD, 340, `400 24px ${BODY}`, C.muted)

  // Equity curve on the right
  curve(ctx, d.curve, { x: Math.max(PAD + w + 60, 620), y: 150, w: 0, h: 210 }, tone(d.net))

  // Stats row
  const top = 418
  ctx.fillStyle = C.line
  ctx.fillRect(PAD, top, CARD_W - PAD * 2, 1)
  const stats: [string, string, string][] = [
    ["Win rate", pct(d.winRate, 1), C.text],
    ["Profit factor", d.profitFactor === null ? "∞" : d.profitFactor.toFixed(2), (d.profitFactor ?? Infinity) >= 1 ? C.profit : C.loss],
    ["Max drawdown", money(d.maxDd), d.maxDd < 0 ? C.loss : C.text],
    ["Best day", money(d.bestDay, true), tone(d.bestDay)],
    ["Trades a day", d.tradesPerDay.toFixed(1), C.text],
  ]
  const colW = (CARD_W - PAD * 2) / stats.length
  stats.forEach(([label, value, color], i) => {
    const x = PAD + i * colW
    if (i) { ctx.fillStyle = C.line; ctx.fillRect(x - 24, top + 28, 1, 76) }
    text(ctx, label, x, top + 52, `400 20px ${BODY}`, C.muted)
    text(ctx, value, x, top + 94, `500 28px ${MONO}`, color)
  })

  // Footer
  text(ctx, d.context, PAD, CARD_H - 44, `400 18px ${BODY}`, C.muted)
  text(ctx, "Made with Jurno", CARD_W - PAD, CARD_H - 44, `400 18px ${BODY}`, C.muted, "right")
}

function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = "left"
) {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.fillText(s, x, y)
}

function curve(ctx: CanvasRenderingContext2D, values: number[], box: { x: number; y: number; w: number; h: number }, color: string) {
  const pts = [0, ...values]
  const high = Math.max(...values), low = Math.min(...values)
  const marks = high !== low
  const right = CARD_W - PAD - (marks ? TAG_COL : 0) // leave a column for the value tags
  const w = right - box.x
  const lo = Math.min(0, ...pts)
  const hi = Math.max(0, ...pts)
  const span = hi - lo || 1
  const px = (i: number) => box.x + (i / (pts.length - 1)) * w
  const py = (v: number) => box.y + box.h - ((v - lo) / span) * box.h
  const zero = py(0)

  // Zero line
  ctx.strokeStyle = C.line
  ctx.setLineDash([4, 6])
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(box.x, zero)
  ctx.lineTo(right, zero)
  ctx.stroke()
  ctx.setLineDash([])

  const line = new Path2D()
  pts.forEach((v, i) => (i ? line.lineTo(px(i), py(v)) : line.moveTo(px(i), py(v))))

  // Fill between the curve and zero
  const area = new Path2D(line)
  area.lineTo(px(pts.length - 1), zero)
  area.lineTo(px(0), zero)
  area.closePath()
  const g = ctx.createLinearGradient(0, box.y, 0, box.y + box.h)
  g.addColorStop(0, color + "40")
  g.addColorStop(1, color + "00")
  ctx.fillStyle = g
  ctx.fill(area)

  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.lineJoin = "round"
  ctx.stroke(line)

  if (!marks) return
  // High and low: a dot on the curve, a faint guide to the tag column, and an outlined value tag
  for (const [v, word, above] of [[high, "High", true], [low, "Low", false]] as const) {
    const x = px(values.indexOf(v) + 1)
    const y = py(v)
    const t = tone(v)
    ctx.strokeStyle = t + "73"
    ctx.setLineDash([3, 5])
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(right + 12, y)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.beginPath()
    ctx.arc(x, y, 6, 0, Math.PI * 2)
    ctx.fillStyle = t
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = C.bg
    ctx.stroke()
    text(ctx, word, x, above ? y - 16 : y + 28, `500 15px ${MONO}`, C.muted, "center")

    valueTag(ctx, money(v, true), right + 16, y, t)
  }
}

/** Outlined value tag, left-aligned at x and centred on y. */
function valueTag(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string) {
  ctx.font = `600 16px ${MONO}`
  const w = ctx.measureText(s).width + 20
  ctx.beginPath()
  ctx.roundRect(x, y - 15, w, 30, 7)
  ctx.fillStyle = C.bg
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = color + "99"
  ctx.stroke()
  text(ctx, s, x + w / 2, y + 6, `600 16px ${MONO}`, color, "center")
}

export const canvasToPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Cannot create the image."))), "image/png")
  )
