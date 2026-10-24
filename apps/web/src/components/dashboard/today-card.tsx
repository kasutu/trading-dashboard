import * as React from "react"
import { useSettings } from "@/hooks/use-settings"
import type { AccountRisk, Analytics } from "@/lib/api/types"
import { LONG_WEEKDAYS, WEEKDAYS, hourLabel, hourList, money, plural, pnlClass } from "@/lib/format"
import { DEFAULT_RISK, limits } from "@/lib/risk"
import { storage } from "@/lib/storage"
import { cn } from "@/lib/utils"

const seenKey = (accountId: string) => `jurno:today-seen:${accountId}`
const notifiedKey = (accountId: string) => `jurno:today-notified:${accountId}`
/** The trades meter shows one segment per trade up to this cap. More segments are noise. */
const METER_MAX = 10

/** The time now, updated every minute. */
function useNow() {
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/** Today's day, weekday (0 = Monday), hour and "HH:MM" in the dashboard timezone. */
function clock(now: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  const hour = Number(get("hour")) % 24
  return {
    day: now.toLocaleDateString("en-CA", { timeZone: tz }),
    weekday: WEEKDAYS.indexOf(get("weekday")),
    hour,
    time: `${String(hour).padStart(2, "0")}:${get("minute")}`,
  }
}

type Tone = "profit" | "loss" | undefined
type Verdict = { label: string; tone: Tone; why: string }
/** One rule for today: an action, an optional note on the right, and an optional warning under it. */
type Rule = { text: string; note?: string; warn?: string; tone?: Tone }

/** Everything the card and the notification say about today. */
function plan(a: Analytics, now: Date, tz: string, balance: number | null, risk: AccountRisk) {
  const { day, weekday, hour } = clock(now, tz)
  const done = a.daily.find((d) => d.key === day)
  const n = done?.trades ?? 0
  const dayNet = done?.net ?? 0
  const date = now.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" })
  const longDay = LONG_WEEKDAYS[weekday] ?? "Today"
  const full = a.locked ? null : a
  const opt = full?.optimization ?? null
  const r = opt?.rules ?? null
  const L = limits(risk, balance, opt && { lossLimit: opt.rules.lossLimit, cap: opt.rules.cap })
  const rest = !!r?.skipWeekdays.includes(weekday)
  const lossHit = L.daily !== null && dayNet <= -L.daily
  // A rest day or a hit loss limit leaves no trades, whatever the cap says.
  const left = rest || lossHit ? 0 : L.trades !== null ? Math.max(L.trades - n, 0) : null

  const keys = (kind: string) => opt?.focus.find((f) => f.kind === kind)?.keys ?? []
  const bestHours = keys("hour").map(Number)
  const wd = full?.byWeekday.find((g) => g.key === WEEKDAYS[weekday])
  const record = !wd?.trades
    ? `You have no ${longDay} trades yet.`
    : wd.net >= 0
      ? `${longDay}s made you ${money(wd.net, true)}.`
      : `${longDay}s lost you ${money(-wd.net)}.`

  const verdict: Verdict =
    L.trades !== null && !rest && n >= L.trades
      ? { label: "Stop trading", tone: "loss", why: `You took all ${plural(L.trades, "trade")} for today.` }
      : lossHit
        ? { label: "Stop trading", tone: "loss", why: `You lost ${money(-dayNet)}. Your limit was ${money(L.daily!)}.` }
        : rest
          ? { label: "Rest today", tone: "loss", why: `Your plan skips ${longDay}s.${wd?.trades && wd.net < 0 ? ` They lost you ${money(-wd.net)}.` : ""}` }
          : keys("weekday").includes(WEEKDAYS[weekday])
            ? { label: "Good day to trade", tone: "profit", why: record }
            : {
                label: "Trade your plan",
                tone: undefined,
                why: opt ? record : a.locked ? "Upgrade to see your best days and hours." : "Your plan needs 30 trades over 10 days.",
              }

  // The rules, as actions. A % limit on a tiny balance gives limits too small to use: say so.
  const rules: Rule[] = []
  if (L.daily !== null) {
    const pctOf = L.from === "account" && risk.kind === "percent" && balance !== null
    rules.push({
      text: `Stop if you lose ${money(L.daily)}`,
      note: L.from === "plan" ? "From your history" : pctOf ? `${risk.daily}% of ${money(balance!)}` : "Your limit",
      warn: pctOf && L.daily < 1 ? `Is ${money(balance!)} your balance? Check Funding, or set dollar limits in Risk.` : undefined,
    })
  } else if (risk.kind === "percent" && risk.daily) {
    rules.push({ text: "Add your deposits to set a loss limit", note: `${risk.daily}% of balance` })
  }
  if (L.perTrade !== null && L.perTrade >= 1) rules.push({ text: `Risk up to ${money(L.perTrade)} a trade` })
  if (bestHours.length)
    rules.push({ text: `Trade at ${hourList(bestHours)}`, ...(bestHours.includes(hour) && { warn: `It is ${hourLabel(hour)}. Good time.`, tone: "profit" as const }) })
  if (r?.skipHours.length)
    rules.push({ text: `Avoid ${hourList(r.skipHours)}`, ...(r.skipHours.includes(hour) && { warn: `It is ${hourLabel(hour)}. Wait.`, tone: "loss" as const }) })
  const symbol = keys("symbol")[0]
  const hold = keys("duration")[0]
  if (symbol || hold) rules.push({ text: [symbol && `Trade ${symbol}`, hold && `${symbol ? "hold" : "Hold"} ${hold}`].filter(Boolean).join(" and ") })

  // Questions to answer before each trade.
  const al = full?.afterLoss
  const questions = [
    bestHours.length > 0 && "Is it a good hour?",
    L.perTrade !== null && L.perTrade >= 1 && `Does this trade risk ${money(L.perTrade)} or less?`,
    al && al.after.trades >= 5 && al.after.avg < al.other.avg && `Did ${al.windowMin} min pass since your last loss?`,
  ].filter((q): q is string => !!q)

  return { day, date, n, dayNet, L, left, rest, stop: verdict.label === "Stop trading", verdict, rules, questions }
}

/** One browser notification a day at the time set in Settings, while Jurno is open in a tab. */
function useDailyNotification(accountId: string, p: ReturnType<typeof plan> | null, now: Date, tz: string) {
  const { settings } = useSettings()
  React.useEffect(() => {
    if (!p || !settings.reminderNotify || typeof Notification === "undefined" || Notification.permission !== "granted") return
    const { day, time } = clock(now, tz)
    if (time < settings.reminderTime || storage.get(notifiedKey(accountId)) === day) return
    storage.set(notifiedKey(accountId), day)
    const body = [p.verdict.why, ...p.rules.slice(0, 2).map((r) => `${r.text}.`)].join(" ")
    try {
      new Notification(p.verdict.label, { body, tag: `jurno-today-${accountId}`, icon: "/favicon.svg" })
    } catch {
      // Some mobile browsers allow notifications only from a service worker.
    }
  }, [accountId, p, now, tz, settings.reminderNotify, settings.reminderTime])
}

/** The daily reminder: what to do today, the rules for today, and questions to ask before each trade.
 *  `a`: analytics on all trades. `balance`: null when the account has no deposits. `risk`: the account's limits. */
export function TodayCard({ accountId, a, balance, risk, tz, className }: { accountId: string; a: Analytics | null; balance: number | null; risk: AccountRisk | null; tz: string; className?: string }) {
  const { settings } = useSettings()
  const now = useNow()
  const p = React.useMemo(() => (a ? plan(a, now, tz, balance, risk ?? DEFAULT_RISK) : null), [a, now, tz, balance, risk])
  useDailyNotification(accountId, p, now, tz)
  // "Daily": show on the first visit of the day only. Decided once per visit, so the card never disappears while
  // you read it.
  const [seen, setSeen] = React.useState<boolean | null>(null)
  if (p && seen === null) setSeen(storage.get(seenKey(accountId)) === p.day)
  const day = p?.day
  React.useEffect(() => {
    if (day && seen === false && settings.reminder === "daily") storage.set(seenKey(accountId), day)
  }, [accountId, day, seen, settings.reminder])
  if (!p || settings.reminder === "off" || (settings.reminder === "daily" && seen)) return null

  return (
    <Shell date={p.date} verdict={p.verdict} className={className}>
      <Trades p={p} />
      {p.rules.length > 0 && (
        <section className="border-t pt-4">
          <h3 className="text-xs font-medium text-muted-foreground">Your rules today</h3>
          <ul className="mt-1 divide-y">
            {p.rules.map((r) => (
              <li key={r.text} className="py-2.5 text-sm last:pb-0">
                <div className="flex items-baseline justify-between gap-4">
                  <span>{r.text}</span>
                  {r.note && <span className="text-right text-xs text-muted-foreground">{r.note}</span>}
                </div>
                {r.warn && <p className={cn("mt-0.5 text-xs font-medium", r.tone === "profit" ? "text-profit" : "text-loss")}>{r.warn}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!p.rest && !p.stop && p.questions.length > 0 && (
        <section className="border-t pt-4">
          <h3 className="text-xs font-medium text-muted-foreground">Before each trade</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {p.questions.map((q) => <li key={q}>{q}</li>)}
          </ul>
        </section>
      )}
    </Shell>
  )
}

/** The big number: trades left today. A meter for small caps, one segment per trade. */
function Trades({ p }: { p: ReturnType<typeof plan> }) {
  const cap = p.L.trades
  const big = "font-display text-5xl font-bold tracking-tight tabular-nums"
  if (p.rest)
    return (
      <div>
        <p className="flex items-baseline gap-2"><span className={big}>0</span><span className="text-sm text-muted-foreground">trades today</span></p>
        <p className="mt-1 text-sm text-muted-foreground">Review your week in the Journal instead.</p>
      </div>
    )
  if (cap === null || p.left === null)
    return (
      <p className="flex items-baseline gap-2">
        <span className={big}>{p.n}</span>
        <span className="text-sm text-muted-foreground">{p.n === 1 ? "trade" : "trades"} today, no trade limit</span>
      </p>
    )
  const left = p.left
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn(big, left === 0 && "text-loss")}>{left}</span>
        <span className="text-sm text-muted-foreground">of {plural(cap, "trade")} left</span>
        {p.n > 0 && <span className={cn("text-sm tabular-nums", pnlClass(p.dayNet))}>{money(p.dayNet, true)} today</span>}
      </p>
      {cap <= METER_MAX && (
        <div className="mt-3 flex gap-1" aria-hidden>
          {Array.from({ length: cap }, (_, k) => (
            <span key={k} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", k < left ? "bg-foreground" : "bg-muted")} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Each kind of day has a color for the wash, the edge and the headline. Normal days use the brand amber. */
const TONE = {
  profit: { wash: "from-profit/15", edge: "border-profit/40", text: "text-profit" },
  loss: { wash: "from-loss/15", edge: "border-loss/40", text: "text-loss" },
  normal: { wash: "from-brand/20", edge: "border-brand/50", text: "" },
}

function Shell({ date, verdict, className, children }: { date: string; verdict: Verdict; className?: string; children: React.ReactNode }) {
  const tone = TONE[verdict.tone ?? "normal"]
  return (
    <section
      aria-label="Today"
      className={cn("@container relative isolate flex min-w-0 flex-col gap-5 overflow-hidden rounded-xl border bg-card p-5 shadow-card lg:p-6", tone.edge, className)}
    >
      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b to-transparent", tone.wash)} />
      <header className="min-w-0 space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Today, {date}</p>
        <h2 className={cn("font-display text-3xl leading-tight font-bold", tone.text)}>{verdict.label}</h2>
        <p className="text-sm text-muted-foreground">{verdict.why}</p>
      </header>
      {children}
    </section>
  )
}
