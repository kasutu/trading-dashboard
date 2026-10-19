// Dev-only fake backend for VITE_MOCK=1. It replaces window.fetch for /api/* so the UI runs without
// the API and auth services. analytics.json and trades.json come from exness-winning.csv (generated
// once with the old TypeScript engine). Analytics ignores the filters; trades honors them.
import type { Account, ColumnMapping, Import, LocalTrade, SavedMapping, Trade } from "@/lib/api/types"
import analytics from "./analytics.json"
import trades from "./trades.json"

const SIGNED_OUT = "jurno:mock-signed-out"
const user = { id: "u1", name: "demo", username: "demo", email: "demo@users.jurno.invalid", emailVerified: false, createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z" }
const exness: ColumnMapping = {
  columns: {
    ticket: "ticket", openTime: "opening_time_utc", closeTime: "closing_time_utc", side: "type", lots: "lots", symbol: "symbol",
    openPrice: "opening_price", closePrice: "closing_price", stopLoss: "stop_loss", takeProfit: "take_profit",
    commission: "commission", swap: "swap", profit: "profit", closeReason: "close_reason",
  },
  timestampsTz: "UTC",
}
const accounts: Account[] = [
  { id: "a1", name: "Exness live", broker: "Exness", currency: "USD", createdAt: "2026-08-01T00:00:00Z", trades: trades.length },
]
const imports: Record<string, Import[]> = {
  a1: [{ id: "i1", fileName: "exness-winning.csv", added: trades.length, duplicates: 0, skipped: 0, createdAt: "2026-10-02T09:00:00Z" }],
}
const mappings: SavedMapping[] = []
let nextId = 2

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

function localize(t: Trade, tz: string): LocalTrade {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(new Date(t.open))
      .map((x) => [x.type, x.value])
  )
  return {
    ...t,
    day: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour) % 24,
    weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday),
    durationMin: (Date.parse(t.close) - Date.parse(t.open)) / 60000,
  }
}

function tradePage(q: URLSearchParams) {
  const last = Math.max(...trades.map((t) => Date.parse(t.close)))
  const range = q.get("range") ?? "all"
  const from = range === "all" ? -Infinity : last - Number(range) * 86400000
  const rows = (trades as Trade[])
    .filter((t) => Date.parse(t.open) >= from && (!q.get("symbol") || t.symbol === q.get("symbol")) && (!q.get("side") || t.side === q.get("side")))
    .map((t) => localize(t, q.get("tz") ?? "UTC"))
    .filter((t) => (!q.get("from") || t.day >= q.get("from")!) && (!q.get("to") || t.day <= q.get("to")!))
    .reverse()
  const page = Number(q.get("page") ?? 0)
  const size = Number(q.get("pageSize") ?? 25)
  return { rows: rows.slice(page * size, (page + 1) * size), total: rows.length }
}

async function handle(method: string, url: URL, body: unknown): Promise<Response> {
  const path = url.pathname.replace(/^\/api/, "")
  const b = (body ?? {}) as Record<string, string>

  if (path === "/auth/get-session")
    return json(localStorage.getItem(SIGNED_OUT) ? null : { user, session: { id: "s1", userId: "u1", token: "t", expiresAt: "2099-01-01T00:00:00Z" } })
  if (path.startsWith("/auth/sign-in") || path.startsWith("/auth/sign-up")) {
    localStorage.removeItem(SIGNED_OUT)
    return json({ token: "t", user })
  }
  if (path === "/auth/sign-out") {
    localStorage.setItem(SIGNED_OUT, "1")
    return json({ success: true })
  }

  if (path === "/me") return json({ id: "u1", username: "demo", plan: "free" })
  if (path === "/presets") return json({ exness })
  if (path === "/mappings" && method === "GET") return json(mappings)
  if (path === "/mappings") {
    const m = { id: `m${nextId++}`, name: b.name, mapping: (body as SavedMapping).mapping, createdAt: new Date().toISOString() }
    mappings.push(m)
    return json(m)
  }
  if (path === "/accounts" && method === "GET") return json(accounts)
  if (path === "/accounts") {
    const a: Account = { id: `a${nextId++}`, name: b.name, broker: b.broker ?? null, currency: "USD", createdAt: new Date().toISOString(), trades: 0 }
    accounts.push(a)
    return json(a)
  }

  const m = path.match(/^\/accounts\/([^/]+)\/(analytics|trades|imports)$/)
  const account = m && accounts.find((a) => a.id === m[1])
  if (!m || !account) return json({ error: "Not found." }, 404)
  if (m[2] === "analytics") return json(account.trades ? analytics : { empty: true })
  if (m[2] === "trades") return json(account.trades ? tradePage(url.searchParams) : { rows: [], total: 0 })
  if (method === "GET") return json(imports[account.id] ?? [])

  const { csv, fileName, mapping } = body as { csv: string; fileName: string; mapping: ColumnMapping }
  const missing = (["openTime", "closeTime", "profit"] as const).find((f) => !mapping.columns[f])
  if (missing) return json({ error: `The mapping has no column for ${missing}.` }, 422)
  const rows = csv.trim().split("\n").length - 1
  const added = account.trades ? 0 : rows
  const result: Import = { id: `i${nextId++}`, fileName, added, duplicates: rows - added, skipped: 0, createdAt: new Date().toISOString() }
  account.trades = trades.length
  imports[account.id] = [result, ...(imports[account.id] ?? [])]
  return json(result)
}

const realFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const req = new Request(input, init)
  const url = new URL(req.url)
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init)
  const text = await req.text()
  await new Promise((r) => setTimeout(r, 150)) // feel a little like a network
  return handle(req.method, url, text ? JSON.parse(text) : undefined)
}
console.info("[jurno] Mock API is on (VITE_MOCK=1).")
