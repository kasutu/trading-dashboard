// Mock journal routes (docs/journal-data.md): setups and mistake tags per person, trade and day reviews
// per trading account, positions with askStop and R, and the summary. In memory, seeded with a story:
// A setups and on-plan trades win, Revenge and Oversized trades lose, Bad days lose.
import type {
  DayReview, DayReviewFields, DayRisk, Grade, Journal, JournalRow, JournalTags, MistakeGroup, MistakeTag, Mood, Position,
  Setup, Trade, TradeReview, TradeReviewFields,
} from "@/lib/api/types"

const NOTE_MAX = 500
const NAME_MAX = 40
const MIN_TRADES = 10
const MIN_DAYS = 10
const RISKS: DayRisk[] = ["tired", "news", "distracted", "chasing"]
const GROUPS: MistakeGroup[] = ["entry", "exit", "size", "mindset"]
const PRESETS: [MistakeGroup, string[]][] = [
  ["entry", ["FOMO", "Late entry", "No setup", "Revenge"]],
  ["exit", ["Early exit", "Held too long", "Moved stop"]],
  ["size", ["Oversized", "No stop"]],
  ["mindset", ["Tired", "Distracted", "Bored"]],
]
const SEED_SETUPS = ["London open breakout", "Pullback to EMA", "Range fade", "News spike"]

type Reply = { status: number; body?: unknown }
const ok = (body: unknown): Reply => ({ status: 200, body })
const bad = (error: string, status = 400): Reply => ({ status, body: { error } })

const cents = (n: number) => Math.round(n * 100) / 100
const dayIn = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz })
let seq = 1
const uid = (p: string) => `${p}${seq++}`

// ---------- Tags, per person. The mock has one user. ----------

let tags: JournalTags | null = null
/** Creates the preset mistake tags on first use, like the API. The mock also seeds a few setups. */
function tagsOf(): JournalTags {
  tags ??= {
    setups: SEED_SETUPS.map((name) => ({ id: uid("s"), name, archived: false })),
    mistakes: PRESETS.flatMap(([group, names]) => names.map((name) => ({ id: uid("m"), name, group, preset: true, archived: false }))),
  }
  return tags
}
const setupByName = (name: string) => tagsOf().setups.find((s) => s.name === name)!.id
const mistakeByName = (name: string) => tagsOf().mistakes.find((m) => m.name === name)!.id

function cleanName(v: unknown, list: { id: string; name: string; archived: boolean }[], self?: string): string | Reply {
  if (typeof v !== "string" || !v.trim()) return bad("Type a name.")
  const name = v.trim().replace(/\s+/g, " ")
  if (name.length > NAME_MAX) return bad(`A name can be up to ${NAME_MAX} characters.`)
  const same = list.find((t) => t.id !== self && !t.archived && t.name.toLowerCase() === name.toLowerCase())
  if (same) return bad(`You already have “${same.name}”.`)
  return name
}

function patchTag<T extends Setup | MistakeTag>(t: T, list: T[], body: Record<string, unknown>): Reply {
  const next = { ...t }
  if ("name" in body) {
    const name = cleanName(body.name, list, t.id)
    if (typeof name !== "string") return name
    next.name = name
  }
  if ("archived" in body) {
    if (typeof body.archived !== "boolean") return bad("archived must be true or false.")
    next.archived = body.archived
    // Restoring next to an active tag with the same name would make two.
    if (!body.archived && list.some((x) => x.id !== t.id && !x.archived && x.name.toLowerCase() === next.name.toLowerCase()))
      return bad(`You already have “${next.name}”.`)
  }
  Object.assign(t, next)
  return ok(t)
}

// ---------- Reviews, per trading account ----------

const tradeReviews: Record<string, Map<string, TradeReview>> = {}
const dayReviews: Record<string, Map<string, DayReview>> = {}

const BLANK_TRADE: TradeReviewFields = {
  followedPlan: null, setupId: null, grade: null, mood: null, mistakeIds: [], noMistakes: false, initialStop: null, initialTarget: null, note: null,
}
const BLANK_DAY: DayReviewFields = { preMood: null, risks: [], noRisks: false, watchSetupIds: [], followedPlan: null, note: null }

const isMood = (v: unknown): v is Mood => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5
/** Every answer blank. `false` is an answer for followedPlan, but only "not tapped" for the None flags. */
const isBlank = (r: TradeReviewFields | DayReviewFields) =>
  Object.entries(r).every(([k, v]) => v === null || (Array.isArray(v) && !v.length) || (v === false && (k === "noMistakes" || k === "noRisks")))

/** Checks a PATCH body field by field. Returns an error message, or the fields to change. */
function tradeInput(body: Record<string, unknown>): string | Partial<TradeReviewFields> {
  const t = tagsOf()
  const out: Partial<TradeReviewFields> = {}
  for (const [k, v] of Object.entries(body)) {
    switch (k) {
      case "followedPlan":
        if (v !== null && typeof v !== "boolean") return "followedPlan must be true, false or null."
        out.followedPlan = v
        break
      case "setupId":
        if (v !== null && !t.setups.some((s) => s.id === v)) return "This setup does not exist."
        out.setupId = v as string | null
        break
      case "grade":
        if (v !== null && !["A", "B", "C"].includes(v as string)) return "The grade must be A, B or C."
        out.grade = v as Grade | null
        break
      case "mood":
        if (v !== null && !isMood(v)) return "The mood must be a number from 1 to 5."
        out.mood = v as Mood | null
        break
      case "mistakeIds":
        if (!Array.isArray(v) || v.some((id) => !t.mistakes.some((m) => m.id === id))) return "A mistake tag does not exist."
        out.mistakeIds = [...new Set(v as string[])]
        break
      case "noMistakes":
        if (typeof v !== "boolean") return "noMistakes must be true or false."
        out.noMistakes = v
        break
      case "initialStop":
        if (v !== null && !(typeof v === "number" && Number.isFinite(v) && v > 0)) return "The starting stop must be a price above 0."
        out.initialStop = v as number | null
        break
      case "initialTarget":
        if (v !== null && !(typeof v === "number" && Number.isFinite(v) && v > 0)) return "The take profit must be a price above 0."
        out.initialTarget = v as number | null
        break
      case "note":
        if (v !== null && typeof v !== "string") return "The note must be text."
        if (typeof v === "string" && v.length > NOTE_MAX) return `A note can be up to ${NOTE_MAX} characters.`
        out.note = (v as string | null)?.trim() || null
        break
      default:
        return `Unknown field: ${k}.`
    }
  }
  return out
}

function dayInput(body: Record<string, unknown>): string | Partial<DayReviewFields> {
  const t = tagsOf()
  const out: Partial<DayReviewFields> = {}
  for (const [k, v] of Object.entries(body)) {
    switch (k) {
      case "preMood":
        if (v !== null && !isMood(v)) return "The mood must be a number from 1 to 5."
        out.preMood = v as Mood | null
        break
      case "risks":
        if (!Array.isArray(v) || v.some((r) => !RISKS.includes(r))) return `Risks can be ${RISKS.join(", ")}.`
        out.risks = RISKS.filter((r) => v.includes(r))
        break
      case "noRisks":
        if (typeof v !== "boolean") return "noRisks must be true or false."
        out.noRisks = v
        break
      case "watchSetupIds":
        if (!Array.isArray(v) || v.some((id) => !t.setups.some((s) => s.id === id))) return "A setup does not exist."
        out.watchSetupIds = [...new Set(v as string[])]
        break
      case "followedPlan":
        if (v !== null && typeof v !== "boolean") return "followedPlan must be true, false or null."
        out.followedPlan = v
        break
      case "note":
        if (v !== null && typeof v !== "string") return "The note must be text."
        if (typeof v === "string" && v.length > NOTE_MAX) return `A note can be up to ${NOTE_MAX} characters.`
        out.note = (v as string | null)?.trim() || null
        break
      default:
        return `Unknown field: ${k}.`
    }
  }
  return out
}

// ---------- Positions ----------

/** The CSV stop looks moved: none, or at the entry or on the profit side of it. */
export const stopLooksMoved = (side: "buy" | "sell", openPrice: number, stopLoss: number | null) =>
  stopLoss === null || (side === "buy" ? stopLoss >= openPrice : stopLoss <= openPrice)

/** R = (close - open) × direction ÷ |open - stop|. Null without a usable stop. */
export function rOf(p: { side: "buy" | "sell"; openPrice: number; closePrice: number; stopLoss: number | null }, initialStop: number | null) {
  const stop = initialStop ?? (stopLooksMoved(p.side, p.openPrice, p.stopLoss) ? null : p.stopLoss)
  if (stop === null || stop === p.openPrice) return null
  const dir = p.side === "buy" ? 1 : -1
  return Math.round((((p.closePrice - p.openPrice) * dir) / Math.abs(p.openPrice - stop)) * 100) / 100
}

/** Trades grouped by ticket. Newest first. */
function positions(accountId: string, trades: Trade[], tz: string): Position[] {
  const byTicket = new Map<string, Trade[]>()
  for (const t of trades) byTicket.set(t.ticket, [...(byTicket.get(t.ticket) ?? []), t])
  const reviews = tradeReviews[accountId]
  return [...byTicket.entries()]
    .map(([ticket, fills]) => {
      const first = fills.reduce((a, b) => (a.open <= b.open ? a : b))
      const last = fills.reduce((a, b) => (a.close >= b.close ? a : b))
      const lots = fills.reduce((s, t) => s + t.lots, 0)
      const closePrice = lots ? fills.reduce((s, t) => s + t.closePrice * t.lots, 0) / lots : last.closePrice
      const base = { side: first.side, openPrice: first.openPrice, closePrice, stopLoss: last.sl }
      return {
        ticket, day: dayIn(first.open, tz), open: first.open, close: last.close, symbol: first.symbol, side: first.side,
        lots: cents(lots), net: cents(fills.reduce((s, t) => s + t.net, 0)),
        openPrice: first.openPrice, closePrice: +closePrice.toFixed(5), stopLoss: last.sl,
        askStop: stopLooksMoved(base.side, base.openPrice, base.stopLoss),
        r: rOf(base, reviews?.get(ticket)?.initialStop ?? null),
      }
    })
    .sort((a, b) => b.open.localeCompare(a.open))
}

function dayStats(list: Position[]) {
  const m = new Map<string, { day: string; trades: number; net: number }>()
  for (const p of list) {
    const s = m.get(p.day) ?? { day: p.day, trades: 0, net: 0 }
    s.trades += 1
    s.net = cents(s.net + p.net)
    m.set(p.day, s)
  }
  return m
}

function journal(accountId: string, trades: Trade[], tz: string): Journal {
  seed(accountId, trades)
  const list = positions(accountId, trades, tz)
  const days = [...(dayReviews[accountId]?.values() ?? [])].sort((a, b) => b.day.localeCompare(a.day))
  const all = dayStats(list)
  const wanted = new Set([...all.keys(), ...days.map((d) => d.day)])
  const stats = [...wanted].sort().reverse().map((day) => all.get(day) ?? { day, trades: 0, net: 0 })
  const tickets = new Set(list.map((p) => p.ticket))
  const trades_ = [...(tradeReviews[accountId]?.values() ?? [])].filter((r) => tickets.has(r.ticket))
  return { positions: list, trades: trades_, days, stats }
}

function row(key: string, items: { net: number; r: number | null }[], wins = items.filter((i) => i.net > 0).length): JournalRow {
  const rs = items.flatMap((i) => (i.r === null ? [] : [i.r]))
  return {
    key,
    trades: items.length,
    net: cents(items.reduce((s, i) => s + i.net, 0)),
    winRate: items.length ? wins / items.length : 0,
    avgR: rs.length ? Math.round((rs.reduce((a, b) => a + b, 0) / rs.length) * 100) / 100 : null,
  }
}

function summary(accountId: string, trades: Trade[], tz: string) {
  seed(accountId, trades)
  const list = positions(accountId, trades, tz)
  const reviews = tradeReviews[accountId] ?? new Map<string, TradeReview>()
  const reviewed = list.flatMap((p) => (reviews.has(p.ticket) ? [{ p, r: reviews.get(p.ticket)! }] : []))
  const group = <K extends string>(keyOf: (r: TradeReview) => K[], order?: K[]) => {
    const m = new Map<K, Position[]>()
    for (const { p, r } of reviewed) for (const k of keyOf(r)) m.set(k, [...(m.get(k) ?? []), p])
    const keys = order ?? [...m.keys()]
    return keys.map((k) => row(k, m.get(k) ?? [])).filter((x) => order || x.trades > 0).sort((a, b) => (order ? 0 : b.trades - a.trades))
  }
  const all = dayStats(list)
  const byDay = new Map<string, Position[]>()
  for (const p of list) byDay.set(p.day, [...(byDay.get(p.day) ?? []), p])
  const days = [...(dayReviews[accountId]?.values() ?? [])].filter((d) => d.preMood && all.has(d.day))
  const byMood = (["1", "2", "3", "4", "5"] as const).map((k) => {
    const of = days.filter((d) => String(d.preMood) === k)
    const r = row(k, of.flatMap((d) => byDay.get(d.day)!))
    // Moods count days: trades = days, net = their total, winRate = share of green days.
    return { ...r, trades: of.length, winRate: of.length ? of.filter((d) => all.get(d.day)!.net > 0).length / of.length : 0 }
  })
  return {
    minTrades: MIN_TRADES,
    minDays: MIN_DAYS,
    byMood,
    bySetup: group((r) => (r.setupId ? [r.setupId] : [])),
    byGrade: group((r) => (r.grade ? [r.grade] : []), ["A", "B", "C"]),
    byMistake: group((r) => r.mistakeIds),
    byPlan: group((r) => (r.followedPlan === null ? [] : [r.followedPlan ? "yes" : "no"]), ["yes", "no"]),
  }
}

// ---------- Routes ----------

/** Handles /journal/* and /accounts/:id/journal/*. Null when the path is not a journal route. */
export function journalRoute(method: string, path: string, q: URLSearchParams, body: unknown, accountTrades: (id: string) => Trade[] | null, free: boolean): Reply | null {
  const b = (body ?? {}) as Record<string, unknown>
  if (path === "/journal/tags" && method === "GET") return ok(tagsOf())
  if (path === "/journal/setups" && method === "POST") {
    const name = cleanName(b.name, tagsOf().setups)
    if (typeof name !== "string") return name
    const s: Setup = { id: uid("s"), name, archived: false }
    tagsOf().setups.push(s)
    return ok(s)
  }
  if (path === "/journal/mistakes" && method === "POST") {
    if (!GROUPS.includes(b.group as MistakeGroup)) return bad(`The group must be ${GROUPS.join(", ")}.`)
    const name = cleanName(b.name, tagsOf().mistakes)
    if (typeof name !== "string") return name
    const m: MistakeTag = { id: uid("m"), name, group: b.group as MistakeGroup, preset: false, archived: false }
    tagsOf().mistakes.push(m)
    return ok(m)
  }
  const tg = path.match(/^\/journal\/(setups|mistakes)\/([^/]+)$/)
  if (tg && method === "PATCH") {
    const list: (Setup | MistakeTag)[] = tg[1] === "setups" ? tagsOf().setups : tagsOf().mistakes
    const t = list.find((x) => x.id === decodeURIComponent(tg[2]))
    if (!t) return bad(tg[1] === "setups" ? "This setup does not exist." : "This mistake tag does not exist.", 404)
    return patchTag(t, list, b)
  }

  const jr = path.match(/^\/accounts\/([^/]+)\/journal(?:\/(summary|days|trades)(?:\/([^/]+))?)?$/)
  if (!jr) return null
  const trades = accountTrades(jr[1])
  if (!trades) return bad("Not found.", 404)
  const accountId = jr[1]
  const tz = q.get("tz") ?? "UTC"
  if (!jr[2] && method === "GET") return ok(journal(accountId, trades, tz))
  if (jr[2] === "summary" && method === "GET") return ok(free ? { locked: true } : summary(accountId, trades, tz))
  if (!jr[3] || method !== "PATCH") return bad("Not found.", 404)
  seed(accountId, trades)
  const key = decodeURIComponent(jr[3])
  if (typeof body !== "object" || body === null || Array.isArray(body)) return bad("Send a JSON object.")

  if (jr[2] === "trades") {
    if (!trades.some((t) => t.ticket === key)) return bad("This trade does not exist.", 404)
    const input = tradeInput(b)
    if (typeof input === "string") return bad(input)
    const store = (tradeReviews[accountId] ??= new Map())
    const prev = store.get(key)
    const next: TradeReviewFields = { ...BLANK_TRADE, ...(prev && strip(prev)), ...input }
    if (next.noMistakes && next.mistakeIds.length) return bad("Pick mistakes or None, not both.")
    if (isBlank(next)) {
      store.delete(key)
      return { status: 204 }
    }
    const saved: TradeReview = { ticket: key, ...next, updatedAt: new Date().toISOString() }
    store.set(key, saved)
    return ok(saved)
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || Number.isNaN(Date.parse(key))) return bad("The day must be yyyy-mm-dd.")
  const input = dayInput(b)
  if (typeof input === "string") return bad(input)
  const store = (dayReviews[accountId] ??= new Map())
  const prev = store.get(key)
  const next: DayReviewFields = { ...BLANK_DAY, ...(prev && stripDay(prev)), ...input }
  if (next.noRisks && next.risks.length) return bad("Pick risks or None, not both.")
  if (isBlank(next)) {
    store.delete(key)
    return { status: 204 }
  }
  const saved: DayReview = { day: key, ...next, updatedAt: new Date().toISOString() }
  store.set(key, saved)
  return ok(saved)
}

const strip = ({ ticket: _t, updatedAt: _u, ...f }: TradeReview): TradeReviewFields => f
const stripDay = ({ day: _d, updatedAt: _u, ...f }: DayReview): DayReviewFields => f

// ---------- Seed ----------

const seeded = new Set<string>()
const SEED_DAYS = [
  "2026-08-03", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-11", "2026-08-13", "2026-08-14", "2026-08-17", "2026-08-20",
  "2026-08-21", "2026-08-25", "2026-08-26", "2026-08-28", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-04", "2026-09-07",
  "2026-09-09", "2026-09-10", "2026-09-14", "2026-09-17", "2026-09-18", "2026-09-22", "2026-09-24",
]
const GOOD_NOTES = [
  "Waited for my levels and let the winners run.",
  "Clear head. Stopped after the target.",
  "Small size, clean entries.",
  "Only took A setups.",
]
const BAD_NOTES = [
  "Stop after two losses. Walk away.",
  "Revenge traded after the first loss. Kept adding size.",
  "Slept badly. Should not have traded.",
  "Chased the move after missing it.",
  "Trading between meetings. Don't.",
]
const WIN_NOTES = ["Textbook breakout and retest.", "Held to target.", "Waited for the candle to close.", null, null]
const LOSS_NOTES = ["Doubled down against the trend.", "Took it out of boredom.", "Moved my stop. Don't.", "Entered before the candle closed.", null]

/** Reviews for two positions (the best and the worst) on 25 days, and those 25 days. Seeded in UTC days. */
function seed(accountId: string, trades: Trade[]) {
  if (seeded.has(accountId) || accountId !== "a1" || !trades.length) return
  seeded.add(accountId)
  const list = positions(accountId, trades, "UTC")
  const store = (tradeReviews[accountId] ??= new Map())
  const dayStore = (dayReviews[accountId] ??= new Map())
  const s = {
    lob: setupByName("London open breakout"), ema: setupByName("Pullback to EMA"),
    fade: setupByName("Range fade"), news: setupByName("News spike"),
  }
  const m = (n: string) => mistakeByName(n)
  let w = 0
  let l = 0
  const put = (p: Position, f: Partial<TradeReviewFields>) => {
    const r: TradeReview = { ticket: p.ticket, ...BLANK_TRADE, ...f, updatedAt: `${p.day}T21:00:00Z` }
    if (p.askStop && r.initialStop === null && (w + l) % 2 === 0) {
      // Some moved stops get a confirmed starting stop, so they have an R.
      const dir = p.side === "buy" ? 1 : -1
      const risk = Math.max(Math.abs(p.closePrice - p.openPrice) * (p.net > 0 ? 0.6 : 1.1), p.openPrice * 0.0008)
      r.initialStop = +(p.openPrice - dir * risk).toFixed(5)
    }
    store.set(p.ticket, r)
  }

  for (const day of SEED_DAYS) {
    const of = list.filter((p) => p.day === day).sort((a, b) => a.net - b.net)
    const pick = of.length > 1 ? [of[0], of.at(-1)!] : of
    for (const p of pick) {
      if (p.net > 0) {
        const i = w++
        const off = i % 7 === 6
        put(p, {
          followedPlan: !off,
          setupId: [s.lob, s.ema, s.lob, s.ema, s.fade, s.lob, s.news][i % 7],
          grade: off ? "B" : i % 5 === 4 ? "B" : "A",
          mood: i % 3 === 0 ? 5 : 4,
          noMistakes: !off,
          mistakeIds: off ? [m(["FOMO", "Early exit", "Bored"][i % 3])] : [],
          note: WIN_NOTES[i % WIN_NOTES.length],
        })
      } else {
        const i = l++
        const off = i % 5 !== 0 && i % 5 !== 3
        put(p, {
          followedPlan: !off,
          setupId: off && i % 4 === 1 ? null : [s.fade, s.news, s.ema, s.lob, s.fade][i % 5],
          grade: off ? "C" : "B",
          mood: off ? ((i % 2) + 1) as Mood : 3,
          noMistakes: !off,
          mistakeIds: !off ? [] : i % 2 === 0 ? [m("Revenge"), m("Oversized")] : i % 3 === 1 ? [m("Oversized"), m("FOMO")] : [m("Revenge"), m("Moved stop")],
          note: off ? LOSS_NOTES[i % LOSS_NOTES.length] : null,
        })
      }
    }
  }

  // Days: the 10 best are Good, the 10 worst Bad, the rest mixed.
  const net = (day: string) => list.filter((p) => p.day === day).reduce((a, p) => a + p.net, 0)
  const ranked = [...SEED_DAYS].sort((a, b) => net(b) - net(a))
  ranked.forEach((day, i) => {
    const good = i < 10
    const badDay = i >= ranked.length - 10
    const mood: Mood = good ? 4 : badDay ? 2 : ([3, 5, 3, 1, 3] as Mood[])[i - 10]
    dayStore.set(day, {
      day,
      preMood: mood,
      risks: badDay ? ([["tired"], ["chasing"], ["news", "distracted"], ["tired", "chasing"]] as DayRisk[][])[i % 4] : [],
      noRisks: good,
      watchSetupIds: good ? [s.lob, s.ema] : i % 2 ? [s.fade] : [s.news, s.lob],
      followedPlan: good ? true : badDay ? i % 3 === 0 : null,
      note: good ? (i % 2 ? GOOD_NOTES[i % GOOD_NOTES.length] : null) : badDay ? BAD_NOTES[i % BAD_NOTES.length] : null,
      updatedAt: `${day}T21:00:00Z`,
    })
  })
}
