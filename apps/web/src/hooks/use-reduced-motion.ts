import * as React from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

const subscribe = (l: () => void) => {
  const m = window.matchMedia(QUERY)
  m.addEventListener("change", l)
  return () => m.removeEventListener("change", l)
}

/** True when the system asks for less motion. */
export const useReducedMotion = () => React.useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches)
