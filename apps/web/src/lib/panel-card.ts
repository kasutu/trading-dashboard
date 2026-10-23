import { BODY, C, CARD_H, CARD_W, FOOTER_H, PAD, drawBrand, drawFooter, startCard, text, type Footer } from "./card-canvas"

/** A dashboard card captured as an image, with its size on screen in CSS pixels. */
export type Capture = { image: HTMLImageElement; w: number; h: number }

export type PanelCardData = Footer & {
  /** null while the card is being captured. */
  capture: Capture | null
}

const TOP = 140 // the card starts below the logo
const GAP = 28 // between the card and the footer
const BOX_H = CARD_H - TOP - GAP - FOOTER_H // room for the card
/** Most a card is enlarged. A small card fills about half the width instead of stretching. */
export const MAX_ZOOM = 1.8

/** How much a card of this size on screen is scaled to fit the square. */
export const cardScale = (w: number, h: number) => Math.min((CARD_W - PAD * 2) / w, BOX_H / h, MAX_ZOOM)

/** Any dashboard card as a square share image: the logo, the card as it looks on screen (fitted and centred),
 *  and the footer. A tall card is scaled down to fit. */
export function drawPanelCard(canvas: HTMLCanvasElement, d: PanelCardData) {
  const ctx = startCard(canvas)
  drawBrand(ctx)
  if (d.capture) {
    const { image, w, h } = d.capture
    const scale = cardScale(w, h)
    const iw = w * scale
    const ih = h * scale
    ctx.drawImage(image, (CARD_W - iw) / 2, TOP + (BOX_H - ih) / 2, iw, ih)
  } else text(ctx, "Preparing image…", CARD_W / 2, TOP + BOX_H / 2, `400 22px ${BODY}`, C.muted, "center")
  drawFooter(ctx, d)
}
