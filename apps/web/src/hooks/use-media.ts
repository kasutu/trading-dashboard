import * as React from "react"

/** True while the media query matches. Re-renders only when it flips. */
export function useMedia(query: string) {
  const subscribe = React.useCallback(
    (l: () => void) => {
      const m = window.matchMedia(query)
      m.addEventListener("change", l)
      return () => m.removeEventListener("change", l)
    },
    [query]
  )
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}

/** Phones: below Tailwind's sm (640px). Charts get shorter and sparser. */
export const usePhone = () => useMedia("(max-width: 639.98px)")

/** Below Tailwind's md (768px): tables turn into lists. */
export const useNarrow = () => useMedia("(max-width: 767.98px)")

/** False while a dialog's open animation runs, then true. Start heavy work (canvas, chart, image capture) only once
 *  it is true, so the animation stays smooth. With reduced motion there is no animation, so it is true at once. */
export function useSettled(ms = 220) {
  const [settled, setSettled] = React.useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  React.useEffect(() => {
    if (settled) return
    const t = setTimeout(() => setSettled(true), ms)
    return () => clearTimeout(t)
  }, [settled, ms])
  return settled
}
