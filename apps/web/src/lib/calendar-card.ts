import { money, plural } from "@/lib/format"
import { BODY, C, CARD_H, CARD_W, DISPLAY, FOOTER_H, PAD, drawBrand, drawFooter, startCard, text, tone, type Footer } from "./card-canvas"

export type CalendarDayCell = {
  /** Day of the month, "1" to "31". */
  label: string
  inMonth: boolean
  net: number
  trades: number
}

export type CalendarCardData = Footer & {
  /** "October 2026" */
  title: string
  /** Monday-first grid, a multiple of 7 cells. */
  cells: CalendarDayCell[]
  net: number
  trades: number
  green: number
  red: number
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** The month calendar as a square image: the month's net P&L large, then the grid, in the style of the stats card. */
export function drawCalendarCard(canvas: HTMLCanvasElement, d: CalendarCardData) {
  const ctx = startCard(canvas)
  drawBrand(ctx)
  text(ctx, d.title, CARD_W - PAD, PAD + 24, `400 24px ${BODY}`, C.muted, "right")

  // Hero: the month's net, and a quiet summary under it
  text(ctx, money(d.net, true), PAD, 232, `800 96px ${DISPLAY}`, tone(d.net))
  const summary = `${plural(d.trades, "trade")}, ${d.green} green, ${d.red} red ${d.green + d.red === 1 ? "day" : "days"}`
  text(ctx, summary, PAD, 280, `400 24px ${BODY}`, C.muted)

  // Grid
  const gap = 8
  const top = 330
  const bottom = CARD_H - FOOTER_H - 28
  const rows = d.cells.length / 7
  const colW = (CARD_W - PAD * 2 - gap * 6) / 7
  const rowH = (bottom - top - 24 - gap * (rows - 1)) / rows
  WEEKDAYS.forEach((w, i) => text(ctx, w, PAD + i * (colW + gap) + colW / 2, top + 6, `500 16px ${BODY}`, C.muted, "center"))

  d.cells.forEach((cell, i) => {
    const x = PAD + (i % 7) * (colW + gap)
    const y = top + 24 + Math.floor(i / 7) * (rowH + gap)
    const traded = cell.trades > 0
    ctx.globalAlpha = cell.inMonth ? 1 : 0.35
    ctx.beginPath()
    ctx.roundRect(x, y, colW, rowH, 10)
    ctx.fillStyle = traded ? tone(cell.net) + "26" : C.faint
    ctx.fill()
    if (traded) {
      ctx.lineWidth = 1
      ctx.strokeStyle = tone(cell.net) + "55"
      ctx.stroke()
    }
    text(ctx, cell.label, x + 10, y + 21, `500 15px ${BODY}`, C.muted)
    if (traded) {
      text(ctx, String(cell.trades), x + colW - 10, y + 21, `400 14px ${BODY}`, C.muted, "right")
      text(ctx, money(cell.net, true), x + 10, y + rowH - 12, `600 17px ${BODY}`, tone(cell.net))
    }
    ctx.globalAlpha = 1
  })

  drawFooter(ctx, d)
}
