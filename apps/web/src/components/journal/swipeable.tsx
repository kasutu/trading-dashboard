import * as React from "react"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { cn } from "@/lib/utils"

export type Direction = "left" | "right"

type Props = {
  /** Called when a drag ends past the threshold. */
  onSwipe: (dir: Direction) => void
  /** Called on a click or tap that did not drag, outside buttons and fields. */
  onTap?: () => void
  /** Set by the parent to send the card off screen (after a swipe, a button or a key). */
  leaving?: Direction | null
  /** Words shown on the card while dragging toward each side. */
  hints: Record<Direction, string>
  className?: string
  children: React.ReactNode
}

const START = 8 // px before a press counts as a drag
const INTERACTIVE = "button, a, input, textarea, select, label, [role=radio], [role=checkbox]"

/** A card you can drag left or right with a mouse, pen or finger. It follows the pointer and tilts a little,
 *  snaps back under the threshold, and respects reduced motion (no tilt, no fly-off). Vertical drags scroll. */
export function Swipeable({ onSwipe, onTap, leaving, hints, className, children }: Props) {
  const reduced = useReducedMotion()
  const [dx, setDx] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const start = React.useRef<{ x: number; y: number; id: number; drag: boolean; moved: boolean } | null>(null)
  const el = React.useRef<HTMLDivElement>(null)
  // Measured when a drag starts: 30% of the card, at most 110 px.
  const [threshold, setThreshold] = React.useState(100)

  const onPointerDown = (e: React.PointerEvent) => {
    if (leaving || (e.pointerType === "mouse" && e.button !== 0)) return
    // Selecting text in a field is not a swipe.
    if ((e.target as HTMLElement).closest("input, textarea, select")) return
    const interactive = !!(e.target as HTMLElement).closest(INTERACTIVE)
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, drag: false, moved: interactive }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    const x = e.clientX - s.x
    const y = e.clientY - s.y
    if (!s.drag) {
      if (Math.abs(y) > START && Math.abs(y) > Math.abs(x)) {
        // A scroll, not a swipe.
        start.current = null
        return
      }
      if (Math.abs(x) < START) return
      s.drag = true
      s.moved = true
      setDragging(true)
      setThreshold(Math.min(110, (el.current?.offsetWidth ?? 300) * 0.3))
      el.current?.setPointerCapture(e.pointerId)
    }
    setDx(x)
  }
  const end = (e: React.PointerEvent, cancel = false) => {
    const s = start.current
    start.current = null
    if (!s || s.id !== e.pointerId) return
    setDragging(false)
    if (!s.drag) {
      if (!cancel && !s.moved && onTap) onTap()
      return
    }
    const x = e.clientX - s.x
    setDx(0)
    if (!cancel && Math.abs(x) >= threshold) onSwipe(x > 0 ? "right" : "left")
  }

  const t = leaving
    ? reduced ? "none" : `translateX(${leaving === "right" ? 130 : -130}%) rotate(${leaving === "right" ? 12 : -12}deg)`
    : dx ? `translateX(${dx}px)${reduced ? "" : ` rotate(${Math.max(-8, Math.min(8, dx * 0.04))}deg)`}` : undefined
  const strength = Math.min(1, Math.abs(dx) / threshold)

  return (
    <div
      ref={el}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => end(e)}
      onPointerCancel={(e) => end(e, true)}
      style={{
        transform: t,
        opacity: leaving && !reduced ? 0 : undefined,
        transition: dragging || reduced ? "none" : "transform 220ms ease-out, opacity 220ms ease-out",
        touchAction: "pan-y",
      }}
      className={cn("relative select-none", dragging && "cursor-grabbing", className)}
    >
      {children}
      {dx !== 0 && (
        <span
          aria-hidden
          style={{ opacity: strength }}
          className={cn(
            "pointer-events-none absolute top-4 z-10 rounded-full border-2 bg-card px-3 py-1 text-sm font-semibold uppercase tracking-wide",
            dx > 0 ? "left-4 -rotate-6 border-profit text-profit" : "right-4 rotate-6 border-loss text-loss"
          )}
        >
          {dx > 0 ? hints.right : hints.left}
        </span>
      )}
    </div>
  )
}
