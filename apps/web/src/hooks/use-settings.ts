import * as React from "react"
import { storage } from "@/lib/storage"

// ponytail: settings live in this browser only. Move them to the server (a column on `profiles`)
// when they need to follow the user across devices.
const KEY = "jurno:settings"

export type Settings = {
  /** Show the before-trading check-in when the dashboard opens. */
  checkIn: boolean
}

const DEFAULTS: Settings = { checkIn: true }
const listeners = new Set<() => void>()

function read(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(storage.get(KEY) ?? "{}") }
  } catch {
    return DEFAULTS
  }
}

// useSyncExternalStore needs a stable snapshot, so keep the parsed value until it changes.
let current = read()

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** User preferences, shared by every component that reads them. */
export function useSettings() {
  const settings = React.useSyncExternalStore(subscribe, () => current)
  const update = React.useCallback((patch: Partial<Settings>) => {
    current = { ...current, ...patch }
    storage.set(KEY, JSON.stringify(current))
    listeners.forEach((l) => l())
  }, [])
  return { settings, update }
}
