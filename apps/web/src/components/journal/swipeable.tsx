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
const SETTLE = "transform 220ms ease-out, opacity 220ms ease-out"

/** A card you can drag left or right with a mouse, pen or finger. It follows the pointer and tilts a little,
 *  snaps back under the threshold, and respects reduced motion (no tilt, no fly-off). Vertical drags scroll.
 *
 *  While dragging, nothing re-renders: pointer moves are batched into one style write per frame
 *  (requestAnimationFrame), and only transform and opacity change, so phones keep up. */
export function Swipeable({ onSwipe, onTap, leaving, hints, className, children }: Props) {
  const reduced = useReducedMotion()
  const start = React.useRef<{ x: number; y: number; id: number; drag: boolean; moved: boolean } | null>(null)
  const el = React.useRef<HTMLDivElement>(null)
  const hintL = React.useRef<HTMLSpanElement>(null)
  const hintR = React.useRef<HTMLSpanElement>(null)
  const frame = React.useRef(0)
  const dx = React.useRef(0)
  // Measured when a drag starts: 30% of the card, at most 110 px.
  const threshold = React.useRef(100)
  const [dragging, setDragging] = React.useState(false)

  /** Writes the card position and hint strength for the current dx, once per frame. */
  const paint = React.useCallback(() => {
    frame.current = 0
    const card = el.current
    if (!card) return
    const x = dx.current
    card.style.transform = x ? `translate3d(${x}px, 0, 0)${reduced ? "" : ` rotate(${Math.max(-8, Math.min(8, x * 0.04))}deg)`}` : ""
    const strength = Math.min(1, Math.abs(x) / threshold.current)
    if (hintR.current) hintR.current.style.opacity = String(x > 0 ? strength : 0)
    if (hintL.current) hintL.current.style.opacity = String(x < 0 ? strength : 0)
  }, [reduced])
  const schedule = () => {
    if (!frame.current) frame.current = requestAnimationFrame(paint)
  }
  React.useEffect(() => () => cancelAnimationFrame(frame.current), [])

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
      threshold.current = Math.min(110, (el.current?.offsetWidth ?? 300) * 0.3)
      el.current?.setPointerCapture(e.pointerId)
      setDragging(true)
    }
    dx.current = x
    schedule()
  }
  const end = (e: React.PointerEvent, cancel = false) => {
    const s = start.current
    start.current = null
    if (!s || s.id !== e.pointerId) return
    if (!s.drag) {
      if (!cancel && !s.moved && onTap) onTap()
      return
    }
    const x = e.clientX - s.x
    setDragging(false)
    dx.current = 0
    schedule()
    if (!cancel && Math.abs(x) >= threshold.current) onSwipe(x > 0 ? "right" : "left")
  }

  // Flying off is driven by React (it follows `leaving`); dragging writes styles directly.
  const off = leaving && !reduced ? `translate3d(${leaving === "right" ? 130 : -130}%, 0, 0) rotate(${leaving === "right" ? 12 : -12}deg)` : undefined
  const hint = "pointer-events-none absolute top-4 z-10 rounded-full border-2 bg-card px-3 py-1 text-sm font-semibold uppercase tracking-wide opacity-0"

  return (
    <div
      ref={el}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => end(e)}
      onPointerCancel={(e) => end(e, true)}
      style={{
        ...(off ? { transform: off, opacity: 0 } : {}),
        transition: dragging || reduced ? "none" : SETTLE,
        touchAction: "pan-y",
        willChange: dragging || leaving ? "transform" : undefined,
      }}
      className={cn("relative select-none", dragging && "cursor-grabbing", className)}
    >
      {children}
      <span ref={hintR} aria-hidden className={cn(hint, "left-4 -rotate-6 border-profit text-profit")}>{hints.right}</span>
      <span ref={hintL} aria-hidden className={cn(hint, "right-4 rotate-6 border-loss text-loss")}>{hints.left}</span>
    </div>
  )
}
