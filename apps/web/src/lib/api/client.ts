import { navigate } from "wouter/use-browser-location"
import type { Filters } from "./types"

/** Call the Jurno API. Throws an Error with the server's message. A 401 sends the user to sign in. */
export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const hasBody = init?.body !== undefined
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  })
  if (res.status === 401) {
    navigate("/sign-in")
    throw new Error("Your session ended. Sign in again.")
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `The server cannot do this now (error ${res.status}). Try again in a minute.`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

/** Query string for the dashboard filters, plus extra params. "all" means no filter. */
export function filterQuery(f: Filters, extra: Record<string, string | number> = {}) {
  const q = new URLSearchParams({ range: f.range, tz: f.tz })
  if (f.symbol !== "all") q.set("symbol", f.symbol)
  if (f.side !== "all") q.set("side", f.side)
  for (const [k, v] of Object.entries(extra)) q.set(k, String(v))
  return q.toString()
}
