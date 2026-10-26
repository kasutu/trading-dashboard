import * as React from "react"
import { api } from "@/lib/api/client"
import type { Me, ServerSettings } from "@/lib/api/types"
import { storage } from "@/lib/storage"

// The check-in setting is saved on the server (`profiles.settings`), so it follows the user to every device. The rest
// are about this browser (its notifications, its Today card) and stay in localStorage.
const KEY = "jurno:settings"

export type Settings = {
  /** Show the before-trading check-in when the dashboard opens. Saved on the server. */
  checkIn: boolean
  /** Show dollar amounts and lot size on the trade share card. */
  shareAmounts: boolean
  /** When the Today card shows: every visit, once a day (until dismissed), or never. */
  reminder: ReminderFrequency
  /** Send a browser notification with the day's plan once a day. */
  reminderNotify: boolean
  /** When that notification goes out, "HH:MM" in the dashboard timezone. */
  reminderTime: string
}

export type ReminderFrequency = "always" | "daily" | "off"

type Local = Omit<Settings, "checkIn">
const DEFAULTS: Local = { shareAmounts: true, reminder: "always", reminderNotify: false, reminderTime: "08:00" }
const SERVER_DEFAULTS: ServerSettings = { checkIn: true, minRr: null }
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function readLocal(): Local & { checkIn?: boolean } {
  try {
    return { ...DEFAULTS, ...JSON.parse(storage.get(KEY) ?? "{}") }
  } catch {
    return DEFAULTS
  }
}

// useSyncExternalStore needs a stable snapshot, so keep the merged value until it changes.
let local = readLocal()
let server: ServerSettings = SERVER_DEFAULTS
let current: Settings = { ...DEFAULTS, ...local, checkIn: server.checkIn }
let loading: Promise<void> | null = null

const rebuild = () => {
  const { checkIn: _old, ...rest } = local
  current = { ...rest, checkIn: server.checkIn }
  notify()
}

/** Loads the server settings once per page. A check-in turned off in this browser before it moved to the server is
 *  carried over, then the old copy is removed. */
function load() {
  // A plain fetch, not api(): signed out (the landing page) is not an error here, and must not go to sign-in.
  loading ??= fetch("/api/me")
    .then((r) => {
      // Signed out: try again on the next mount, after sign in.
      if (r.ok) return r.json() as Promise<Me>
      loading = null
      return null
    })
    .then(async (me) => {
      if (!me?.settings) return
      server = me.settings
      if (local.checkIn === false && server.checkIn) server = await api<ServerSettings>("/me/settings", { method: "PATCH", body: { checkIn: false } })
      if (local.checkIn !== undefined) {
        const { checkIn: _gone, ...rest } = local
        local = rest
        storage.set(KEY, JSON.stringify(local))
      }
      rebuild()
    })
    .catch(() => { loading = null })
  return loading
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** The server settings, for the playbook's minimum R:R. */
export function useServerSettings() {
  React.useSyncExternalStore(subscribe, () => current)
  React.useEffect(() => { load() }, [])
  const update = React.useCallback(async (patch: Partial<ServerSettings>) => {
    server = await api<ServerSettings>("/me/settings", { method: "PATCH", body: patch })
    rebuild()
  }, [])
  return { server, update }
}

/** User preferences, shared by every component that reads them. */
export function useSettings() {
  const settings = React.useSyncExternalStore(subscribe, () => current)
  React.useEffect(() => { load() }, [])
  const update = React.useCallback((patch: Partial<Settings>) => {
    const { checkIn, ...rest } = patch
    if (Object.keys(rest).length) {
      local = { ...local, ...rest }
      storage.set(KEY, JSON.stringify(local))
    }
    if (checkIn !== undefined) {
      // Show the change at once; put it back if the server refuses it.
      const before = server
      server = { ...server, checkIn }
      api<ServerSettings>("/me/settings", { method: "PATCH", body: { checkIn } }).then(
        (s) => { server = s; rebuild() },
        () => { server = before; rebuild() }
      )
    }
    rebuild()
  }, [])
  return { settings, update }
}
