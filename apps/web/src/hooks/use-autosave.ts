import * as React from "react"

export type SaveState = { kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string }

const DEBOUNCE_MS = 600

/** Saves answers as they are given, one request at a time, in order. `now` sends at once (a tap);
 *  `later` waits until typing stops for 600 ms, or until `flush` (on blur) or unmount.
 *  `idle` is true when nothing is waiting or on its way. */
export function useAutosave<T extends object>(save: (patch: Partial<T>) => Promise<unknown>) {
  const [state, setState] = React.useState<SaveState>({ kind: "idle" })
  const [inflight, setInflight] = React.useState(0)
  const [typing, setTyping] = React.useState(false)
  const saveRef = React.useRef(save)
  React.useEffect(() => { saveRef.current = save })
  const chain = React.useRef<Promise<unknown>>(Promise.resolve())
  const pending = React.useRef<Partial<T> | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const send = React.useCallback((patch: Partial<T>) => {
    setState({ kind: "saving" })
    setInflight((n) => n + 1)
    const run = chain.current.then(() => saveRef.current(patch))
    chain.current = run.catch(() => {})
    return run.then(
      () => setState({ kind: "saved" }),
      (e: Error) => setState({ kind: "error", message: e.message })
    ).finally(() => setInflight((n) => n - 1))
  }, [])

  const flush = React.useCallback(() => {
    clearTimeout(timer.current)
    timer.current = undefined
    const p = pending.current
    pending.current = null
    setTyping(false)
    if (p) send(p)
  }, [send])

  const now = React.useCallback((patch: Partial<T>) => {
    // A typed note waiting to be sent goes first, so answers arrive in the order they were given.
    if (pending.current) flush()
    return send(patch)
  }, [flush, send])

  const later = React.useCallback((patch: Partial<T>) => {
    pending.current = { ...pending.current, ...patch }
    setTyping(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, DEBOUNCE_MS)
  }, [flush])

  // Closing a popover or sheet mid-typing still saves.
  React.useEffect(() => () => { if (pending.current) flush() }, [flush])

  return { state, now, later, flush, idle: inflight === 0 && !typing }
}
