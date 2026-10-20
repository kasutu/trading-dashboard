// Shared drawing for the 1200 × 630 share images (stats card, calendar).
// The images always use the dark theme so they look the same wherever they are posted.
import { MARK } from "@/components/brand/mark"
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
  /** Filters on the left, for example "All symbols · Buy and sell". */
  context: string
  /** Show the "Track your trades free" invitation. Latte and owner hide it. */
  invite: boolean
  /** Site address, for example "jurno.up.railway.app". */
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

export function drawFooter(ctx: CanvasRenderingContext2D, f: Footer) {
  text(ctx, f.context, PAD, CARD_H - 44, `400 18px ${BODY}`, C.muted)
  if (f.invite) {
    // Invitation: one quiet line, then the address people can type.
    text(ctx, "Track your trades free", CARD_W - PAD, CARD_H - 70, `400 17px ${BODY}`, C.muted, "right")
    text(ctx, f.site, CARD_W - PAD, CARD_H - 44, `600 20px ${BODY}`, C.text, "right")
  }
}

export const canvasToPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Cannot create the image."))), "image/png")
  )
