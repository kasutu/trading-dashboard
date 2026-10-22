// Shared drawing for the 1200 × 630 share images (stats card, calendar, trade).
// The images always use the dark theme so they look the same wherever they are posted.
import { MARK } from "@/components/brand/mark"
import qrcode from "qrcode-generator"
import type { Filters } from "@/lib/api/types"

export const CARD_W = 1200
export const CARD_H = 630
export const PAD = 64
const SCALE = 2 // render at 2x for sharp text

export const C = {
  bg: "#111823",
  line: "rgba(255,255,255,0.09)",
  text: "#e8edf3",
  muted: "#8c97a6",
  brand: "#f2bf3a",
  profit: "#3cc398",
  loss: "#f06a5d",
}
// SF Pro on Apple devices, the system font elsewhere. Numbers use the same font.
export const DISPLAY = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro", system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
export const BODY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
export const MONO = BODY

export const tone = (n: number) => (n > 0 ? C.profit : n < 0 ? C.loss : C.text)

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left") {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.fillText(s, x, y)
}

/** Sizes the canvas, fills the background and returns a context in 1200 × 630 units. */
export function startCard(canvas: HTMLCanvasElement) {
  canvas.width = CARD_W * SCALE
  canvas.height = CARD_H * SCALE
  const ctx = canvas.getContext("2d")!
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  return ctx
}

/** Logo and wordmark on the left. */
export function drawBrand(ctx: CanvasRenderingContext2D) {
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
}

export type Footer = {
  /** Left side, for example the filters ("All symbols · Buy and sell"). */
  context: string
  /** Show the "Track your trades free" line above the address. Latte and owner hide it. */
  invite: boolean
  /** Site address, for example "jurno.up.railway.app". Always shown, with a QR code to it. */
  site: string
}

/** Footer for a share image: the active filters, and the invitation unless the plan hides it. */
export function shareFooter(f: Filters, invite: boolean): Footer {
  return {
    context: [
      f.symbol === "all" ? "All symbols" : f.symbol,
      f.side === "all" ? "Buy and sell" : f.side === "buy" ? "Buy only" : "Sell only",
    ].join(" · "),
    invite,
    site: window.location.host,
  }
}

/** Height of the footer band at the bottom of a card. Content above it must end before this. */
export const FOOTER_H = 112
const QR = 84 // QR code size, including its light border

/** Context on the left; on the right the address with a QR code to it, and the invitation unless the plan hides it. */
export function drawFooter(ctx: CanvasRenderingContext2D, f: Footer) {
  const base = CARD_H - 40
  text(ctx, f.context, PAD, base, `400 18px ${BODY}`, C.muted)
  const qrX = CARD_W - PAD - QR
  drawQr(ctx, `https://${f.site}`, qrX, CARD_H - 28 - QR, QR)
  const right = qrX - 20
  if (f.invite) text(ctx, "Track your trades free", right, base - 26, `400 17px ${BODY}`, C.muted, "right")
  text(ctx, f.site, right, base, `600 20px ${BODY}`, C.text, "right")
}

/** A QR code: dark modules on a light rounded square, so phones read it on the dark card. */
function drawQr(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, size: number) {
  const qr = qrcode(0, "M")
  qr.addData(url)
  qr.make()
  const n = qr.getModuleCount()
  const quiet = 2 // modules of light border
  const cell = size / (n + quiet * 2)
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, 8)
  ctx.fillStyle = "#ffffff"
  ctx.fill()
  ctx.fillStyle = C.bg
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      // Overlap by a hair so no seams show between modules.
      if (qr.isDark(r, c)) ctx.fillRect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell + 0.3, cell + 0.3)
}

export const canvasToPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Cannot create the image."))), "image/png")
  )
