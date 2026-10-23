import { BODY, C, CARD_H, CARD_W, FOOTER_H, PAD, drawBrand, drawFooter, startCard, text, type Footer } from "./card-canvas"

/** A dashboard card captured as an image, with its size on screen in CSS pixels. */
export type Capture = { image: HTMLImageElement; w: number; h: number }

export type PanelCardData = Footer & {
  /** null while the card is being captured. */
  capture: Capture | null
}

const TOP = 128 // the card starts below the logo
const GAP = 28 // between the card and the footer
const MAX_H = 1240 // tallest the card may be drawn; taller cards are scaled down
/** Most a card is enlarged. A small card fills about half the width instead of stretching. */
export const MAX_ZOOM = 1.8

/** How much a card of this size on screen is scaled in the image. */
export const cardScale = (w: number, h: number) => Math.min((CARD_W - PAD * 2) / w, MAX_H / h, MAX_ZOOM)

/** Any dashboard card as a share image: the logo, the card as it looks on screen, and the footer.
 *  1200 wide; as tall as the card needs, at least 630. */
export function drawPanelCard(canvas: HTMLCanvasElement, d: PanelCardData) {
  if (!d.capture) {
    const ctx = startCard(canvas)
    drawBrand(ctx)
    text(ctx, "Preparing image…", CARD_W / 2, CARD_H / 2, `400 20px ${BODY}`, C.muted, "center")
    drawFooter(ctx, d)
    return
  }
  const { image, w, h } = d.capture
  const scale = cardScale(w, h)
  const iw = w * scale
  const ih = h * scale
  const height = Math.max(CARD_H, Math.round(TOP + ih + GAP + FOOTER_H))
  const ctx = startCard(canvas, undefined, height)
  drawBrand(ctx)
  // Centre the card in the space between the logo and the footer.
  const y = TOP + (height - TOP - GAP - FOOTER_H - ih) / 2
  ctx.drawImage(image, (CARD_W - iw) / 2, y, iw, ih)
  drawFooter(ctx, d, height)
}
