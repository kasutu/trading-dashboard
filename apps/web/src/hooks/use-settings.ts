import * as React from "react"
import { storage } from "@/lib/storage"

// ponytail: settings live in this browser only. Move them to the server (a column on `profiles`)
// when they need to follow the user across devices.
const KEY = "jurno:settings"

export type Settings = {
  /** Show the before-trading check-in when the dashboard opens. */
  checkIn: boolean
  /** Show dollar amounts and lot size on the trade share card. */
  shareAmounts: boolean
  /** When the Today card shows: every visit, once a day (until dismissed), or never. */
  reminder: ReminderFrequency
  /** Send a browser notification with the day's plan once a day. */
  reminderNotify: boolean
  /** When that notification goes out, "HH:MM" in the dashboard timezone. */
  reminderTime: string
  /** The most to risk in a day, as a % of the account balance. The Today card recommends the smaller of this and the
   *  plan's daily loss limit. */
  riskPct: number
}

export type ReminderFrequency = "always" | "daily" | "off"

const DEFAULTS: Settings = { checkIn: true, shareAmounts: true, reminder: "always", reminderNotify: false, reminderTime: "08:00", riskPct: 2 }
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
