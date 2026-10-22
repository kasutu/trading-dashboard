// Dev-only fake backend for VITE_MOCK=1. It replaces window.fetch for /api/* so the UI runs without
// the API and auth services. analytics.json and trades.json come from exness-winning.csv (generated
// once with the old TypeScript engine). Analytics ignores the filters; trades honors them.
// The plan is Free. Open any page with ?plan=espresso (or latte, owner, free) to switch; it is remembered.
import type {
  Account, CashDay, CashFlow, ColumnMapping, DayEntry, Import, Journal, JournalInput, JournalPosition, LocalTrade, Me, Mood, MoodRow,
  SavedMapping, Trade, TradeEntry,
} from "@/lib/api/types"
import analytics from "./analytics.json"
import trades from "./trades.json"

const SIGNED_OUT = "jurno:mock-signed-out"
const PLAN = "jurno:mock-plan"
const PLAN_IDS: Me["plan"][] = ["free", "espresso", "latte", "owner"]
const planParam = new URLSearchParams(location.search).get("plan") as Me["plan"] | null
if (planParam && PLAN_IDS.includes(planParam)) localStorage.setItem(PLAN, planParam)
const plan = (): Me["plan"] => {
  const p = localStorage.getItem(PLAN) as Me["plan"] | null
  return p && PLAN_IDS.includes(p) ? p : "free"
}
/** Fields the API leaves out of analytics on Free (crates/api/src/plan.rs). */
const PAID_FIELDS = ["byHour", "byWeekday", "heatmap", "byDuration", "nthTrade", "dayBuckets", "capSim", "lossLimitSim", "afterLoss", "optimization"]
const forPlan = (a: typeof analytics) =>
  plan() === "free" ? { ...Object.fromEntries(Object.entries(a).filter(([k]) => !PAID_FIELDS.includes(k))), locked: true } : a
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
const flow = (id: string, occurredAt: string, kind: CashFlow["kind"], amount: number, note: string | null = null): CashFlow =>
  ({ id, occurredAt, kind, amount, note, createdAt: occurredAt })
const cashFlows: Record<string, CashFlow[]> = {
  a1: [
    flow("c1", "2026-07-30T10:00:00Z", "deposit", 1000, "Initial funding"),
    flow("c2", "2026-08-18T09:30:00Z", "deposit", 500, "Bank transfer"),
    flow("c3", "2026-09-02T14:00:00Z", "withdrawal", 300, "Took some profit"),
    flow("c4", "2026-09-15T08:15:00Z", "deposit", 250),
    flow("c5", "2026-09-26T16:45:00Z", "withdrawal", 400, "Rent"),
  ],
}
let nextId = 2

// Journal: moods on 30 of the 44 trading days, worse moods on worse days. Days are UTC dates.
const SEED_MOODS: Record<Mood, string[]> = {
  1: ["2026-09-09", "2026-09-14"],
  2: ["2026-09-01", "2026-09-07", "2026-09-04", "2026-09-17", "2026-08-17", "2026-08-31", "2026-08-21", "2026-09-10", "2026-09-29", "2026-09-08"],
  3: ["2026-08-28", "2026-08-03", "2026-09-16", "2026-09-22", "2026-08-07"],
  4: ["2026-08-11", "2026-08-20", "2026-08-13", "2026-09-24", "2026-08-06", "2026-09-23", "2026-09-21", "2026-09-15", "2026-09-18", "2026-08-26", "2026-09-02"],
  5: ["2026-08-25", "2026-08-05"],
}
const SEED_NOTES: Record<string, string> = {
  "2026-09-09": "Revenge traded after the first EURUSD loss. Kept adding size. Should have stopped at two losses.",
  "2026-09-14": "Slept badly. Took setups I would normally skip.",
  "2026-09-01": "Back from the weekend and rusty. Too many trades in the first hour.",
  "2026-09-07": "Chased BTC after missing the move.",
  "2026-08-17": "Distracted, trading between meetings.",
  "2026-08-25": "Waited for my levels and let the winners run. Best day this month.",
  "2026-08-05": "Clear head, followed the plan.\nStopped after the target.",
  "2026-09-18": "Calm session. Small size, clean entries.",
  "2026-08-26": "Good day. One sloppy BTC trade at the end.",
  "2026-08-03": "First day on the new account. Just getting a feel.",
  "2026-09-28": "Long day, no energy. Didn't set a mood.",
}
const SEED_TRADES: [string, Mood | null, string | null][] = [
  ["1216", 1, "Doubled down against the trend. No stop."],
  ["1206", 2, "Entered early, before the candle closed."],
  ["1236", 2, "Took it out of boredom."],
  ["1125", 5, "Textbook breakout and retest."],
  ["1018", 4, "Held to target."],
  ["1131", 4, null],
  ["1137", null, "Moved my stop. Don't."],
  ["1298", 2, "Late entry after news."],
]
const seededAt = (day: string) => `${day}T20:00:00Z`
const dayEntries: Record<string, Map<string, DayEntry>> = { a1: new Map() }
for (const [mood, days] of Object.entries(SEED_MOODS))
  for (const day of days) dayEntries.a1.set(day, { day, mood: Number(mood) as Mood, note: SEED_NOTES[day] ?? null, updatedAt: seededAt(day) })
for (const [day, note] of Object.entries(SEED_NOTES))
  if (!dayEntries.a1.has(day)) dayEntries.a1.set(day, { day, mood: null, note, updatedAt: seededAt(day) })
const tradeEntries: Record<string, Map<string, TradeEntry>> = {
  a1: new Map(SEED_TRADES.map(([ticket, mood, note]) => {
    const close = (trades as Trade[]).find((t) => t.ticket === ticket)!.close
    return [ticket, { ticket, mood, note, updatedAt: close }]
  })),
}
const MIN_MOOD_DAYS = 10

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

const dayIn = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz })
const cents = (n: number) => Math.round(n * 100) / 100

/** Same shape as the API: rows newest first with their day, totals, and the per-day timeline. */
function cashReport(flows: CashFlow[], tz: string) {
  const rows = [...flows].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((f) => ({ ...f, day: dayIn(f.occurredAt, tz) }))
  const total = (kind: CashFlow["kind"]) => {
    const of = flows.filter((f) => f.kind === kind)
    return { count: of.length, total: cents(of.reduce((s, f) => s + f.amount, 0)) }
  }
  const deposits = total("deposit")
  const withdrawals = total("withdrawal")
  const days = new Map<string, CashDay>()
  for (const r of [...rows].reverse()) {
    const d = days.get(r.day) ?? { day: r.day, deposits: 0, withdrawals: 0, net: 0, cumulative: 0 }
    if (r.kind === "deposit") d.deposits += r.amount
    else d.withdrawals += r.amount
    days.set(r.day, d)
  }
  let cumulative = 0
  const daily = [...days.values()].map((d) => {
    cumulative += d.deposits - d.withdrawals
    return { ...d, net: cents(d.deposits - d.withdrawals), cumulative: cents(cumulative) }
  })
  return { rows, summary: { deposits, withdrawals, net: cents(deposits.total - withdrawals.total) }, daily }
}

/** Trades of the account per day in tz: count and net. */
function dayStats(accountTrades: Trade[], tz: string) {
  const m = new Map<string, { day: string; trades: number; net: number }>()
  for (const t of accountTrades) {
    const day = dayIn(t.open, tz)
    const s = m.get(day) ?? { day, trades: 0, net: 0 }
    s.trades += 1
    s.net += t.net
    m.set(day, s)
  }
  for (const s of m.values()) s.net = cents(s.net)
  return m
}

/** A position summed over its partial closes. */
function position(accountTrades: Trade[], ticket: string, tz: string): JournalPosition | null {
  const fills = accountTrades.filter((t) => t.ticket === ticket)
  if (!fills.length) return null
  const first = fills.reduce((a, b) => (a.open <= b.open ? a : b))
  return {
    day: dayIn(first.open, tz), symbol: first.symbol, side: first.side,
    lots: cents(fills.reduce((s, t) => s + t.lots, 0)), net: cents(fills.reduce((s, t) => s + t.net, 0)),
  }
}

function journal(accountId: string, accountTrades: Trade[], tz: string): Journal {
  const days = [...(dayEntries[accountId]?.values() ?? [])].sort((a, b) => b.day.localeCompare(a.day))
  const tradeRows = [...(tradeEntries[accountId]?.values() ?? [])]
    .map((e) => ({ ...e, position: position(accountTrades, e.ticket, tz) }))
    .sort((a, b) => (b.position?.day ?? "").localeCompare(a.position?.day ?? ""))
  const all = dayStats(accountTrades, tz)
  const wanted = new Set([...days.map((d) => d.day), ...tradeRows.flatMap((t) => (t.position ? [t.position.day] : []))])
  const stats = [...wanted].sort().reverse().map((day) => all.get(day) ?? { day, trades: 0, net: 0 })
  return { days, trades: tradeRows, stats }
}

/** P&L by mood: trading days only (a mood on a day without trades does not count). */
function moodSummary(accountId: string, accountTrades: Trade[], tz: string) {
  const all = dayStats(accountTrades, tz)
  const byMood: MoodRow[] = ([1, 2, 3, 4, 5] as Mood[]).map((mood) => {
    const days = [...(dayEntries[accountId]?.values() ?? [])].filter((d) => d.mood === mood && all.has(d.day)).map((d) => all.get(d.day)!)
    const net = cents(days.reduce((s, d) => s + d.net, 0))
    return {
      mood, days: days.length, net,
      avgPerDay: days.length ? cents(net / days.length) : 0,
      winRate: days.length ? days.filter((d) => d.net > 0).length / days.length : 0,
    }
  })
  return { byMood, minDays: MIN_MOOD_DAYS }
}

/** Validates a PUT body. Returns an error message, or the cleaned input. */
function journalInput(body: unknown): string | JournalInput {
  const { mood = null, note = null } = (body ?? {}) as Partial<JournalInput>
  if (mood !== null && !(Number.isInteger(mood) && mood >= 1 && mood <= 5)) return "The mood must be a number from 1 to 5, or empty."
  if (note !== null && typeof note !== "string") return "The note must be text."
  if (note && note.length > 500) return "A note can be up to 500 characters."
  return { mood, note: note?.trim() || null }
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

  if (path === "/me") return json({ id: "u1", username: "demo", plan: plan() })
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

  const c = path.match(/^\/accounts\/([^/]+)\/cash-flows(?:\/([^/]+))?$/)
  if (c && accounts.some((a) => a.id === c[1])) {
    const list = (cashFlows[c[1]] ??= [])
    if (method === "GET") return json(cashReport(list, url.searchParams.get("tz") ?? "UTC"))
    if (method === "DELETE") {
      const i = list.findIndex((f) => f.id === c[2])
      if (i < 0) return json({ error: "This deposit or withdrawal does not exist." }, 404)
      list.splice(i, 1)
      return json(undefined, 204)
    }
    const { occurredAt, kind, amount, note } = body as CashFlow
    if (!(amount > 0)) return json({ error: "The amount must be more than zero." }, 400)
    const f = flow(`cf${nextId++}`, new Date(occurredAt).toISOString().replace(".000Z", "Z"), kind, amount, note?.trim() || null)
    list.push(f)
    return json(f)
  }

  const jr = path.match(/^\/accounts\/([^/]+)\/journal(?:\/(summary|days|trades)(?:\/([^/]+))?)?$/)
  const jAccount = jr && accounts.find((a) => a.id === jr[1])
  if (jr && jAccount) {
    const accountTrades = jAccount.trades ? (trades as Trade[]) : []
    const tz = url.searchParams.get("tz") ?? "UTC"
    if (!jr[2] && method === "GET") return json(journal(jAccount.id, accountTrades, tz))
    if (jr[2] === "summary" && method === "GET")
      return json(plan() === "free" ? { locked: true } : moodSummary(jAccount.id, accountTrades, tz))
    if ((jr[2] === "days" || jr[2] === "trades") && jr[3] && method === "PUT") {
      const key = decodeURIComponent(jr[3])
      if (jr[2] === "days" && !/^\d{4}-\d{2}-\d{2}$/.test(key)) return json({ error: "The day must be yyyy-mm-dd." }, 400)
      if (jr[2] === "trades" && !accountTrades.some((t) => t.ticket === key)) return json({ error: "This trade does not exist." }, 404)
      const input = journalInput(body)
      if (typeof input === "string") return json({ error: input }, 400)
      const store = jr[2] === "days" ? (dayEntries[jAccount.id] ??= new Map()) : (tradeEntries[jAccount.id] ??= new Map())
      if (input.mood === null && input.note === null) {
        store.delete(key)
        return json(undefined, 204)
      }
      const entry = { ...input, updatedAt: new Date().toISOString(), ...(jr[2] === "days" ? { day: key } : { ticket: key }) }
      ;(store as Map<string, typeof entry>).set(key, entry)
      return json(entry)
    }
  }

  const m = path.match(/^\/accounts\/([^/]+)\/(analytics|trades|imports)$/)
  const account = m && accounts.find((a) => a.id === m[1])
  if (!m || !account) return json({ error: "Not found." }, 404)
  if (m[2] === "analytics") return json(account.trades ? forPlan(analytics) : { empty: true })
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
console.info(`[jurno] Mock API is on (VITE_MOCK=1), plan: ${plan()}. Add ?plan=espresso to the URL to switch.`)
