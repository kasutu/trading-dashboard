import * as React from "react"
import { useSettings } from "@/hooks/use-settings"
import type { AccountRisk, Analytics } from "@/lib/api/types"
import { WEEKDAYS, hourLabel, money, plural, pnlClass } from "@/lib/format"
import { DEFAULT_RISK, limits, type Limits } from "@/lib/risk"
import { storage } from "@/lib/storage"
import { cn } from "@/lib/utils"
import { toneClass } from "./metrics"

const LONG_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const seenKey = (accountId: string) => `jurno:today-seen:${accountId}`
const notifiedKey = (accountId: string) => `jurno:today-notified:${accountId}`

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

type Verdict = { label: string; tone?: "profit" | "loss"; why: string }

/** Everything the card and the notification say about today. */
function plan(a: Analytics, now: Date, tz: string, balance: number | null, risk: AccountRisk) {
  const { day, weekday, hour } = clock(now, tz)
  const done = a.daily.find((d) => d.key === day)
  const n = done?.trades ?? 0
  const dayNet = done?.net ?? 0
  const date = now.toLocaleDateString("en-US", { timeZone: tz, month: "long", day: "numeric" })
  const full = a.locked ? null : a
  const opt = full?.optimization ?? null
  const L = limits(risk, balance, opt && { lossLimit: opt.rules.lossLimit, cap: opt.rules.cap })
  const left = L.trades !== null ? Math.max(L.trades - n, 0) : null
  const capHit = left === 0
  const lossHit = L.daily !== null && dayNet <= -L.daily
  const stop: Verdict | null = capHit
    ? { label: "Done for today", tone: "loss", why: "Trade limit reached." }
    : lossHit
      ? { label: "Done for today", tone: "loss", why: "Loss limit reached." }
      : null
  const base = { day, date, n, dayNet, L, left, lossHit, balance, risk, verdict: stop }
  if (!full || !opt) return { ...base, locked: !!a.locked, rules: null }

  const r = opt.rules
  const keys = (kind: string) => opt.focus.find((f) => f.kind === kind)?.keys ?? []
  const bestDays = keys("weekday")
  const bestHours = keys("hour").map(Number)
  const longDay = LONG_DAYS[weekday] ?? "Today"
  const wd = full.byWeekday.find((g) => g.key === WEEKDAYS[weekday])
  const record = wd?.trades ? `${longDay}s: ${money(wd.net, true)}` : `No ${longDay} trades`
  const verdict: Verdict =
    stop ??
    (r.skipWeekdays.includes(weekday)
      ? { label: "Rest day", tone: "loss", why: record }
      : bestDays.includes(WEEKDAYS[weekday])
        ? { label: "Best day", tone: "profit", why: record }
        : { label: "Normal day", why: record })

  const nowTag = r.skipHours.includes(hour)
    ? { text: "Skip now", tone: "loss" as const }
    : bestHours.includes(hour)
      ? { text: "Best now", tone: "profit" as const }
      : null

  return { ...base, locked: false, rules: r, verdict, nowTag, bestDays, bestHours, symbol: keys("symbol")[0], hold: keys("duration")[0] }
}

/** One browser notification a day at the time set in Settings, while Jurno is open in a tab. */
function useDailyNotification(accountId: string, p: ReturnType<typeof plan> | null, now: Date, tz: string) {
  const { settings } = useSettings()
  React.useEffect(() => {
    if (!p || !settings.reminderNotify || typeof Notification === "undefined" || Notification.permission !== "granted") return
    const { day, time } = clock(now, tz)
    if (time < settings.reminderTime || storage.get(notifiedKey(accountId)) === day) return
    storage.set(notifiedKey(accountId), day)
    const trades = p.left !== null ? `${p.left} of ${plural(p.L.trades!, "trade")} left` : plural(p.n, "trade") + " today"
    const loss = p.L.daily !== null ? ` Max loss: ${money(p.L.daily)}.` : ""
    const body = `${trades}.${loss}${p.verdict ? ` ${p.verdict.why}.` : ""}`
    try {
      new Notification(p.verdict?.label ?? "Your day today", { body, tag: `jurno-today-${accountId}`, icon: "/favicon.svg" })
    } catch {
      // Some mobile browsers allow notifications only from a service worker.
    }
  }, [accountId, p, now, tz, settings.reminderNotify, settings.reminderTime])
}

/** The daily reminder: the kind of day, trades left, and when to stop. Settings control how often it shows.
 *  `a`: analytics on all trades. `balance`: null when the account has no deposits. `risk`: the account's limits. */
export function TodayCard({ accountId, a, balance, risk, tz, className }: { accountId: string; a: Analytics | null; balance: number | null; risk: AccountRisk | null; tz: string; className?: string }) {
  const { settings } = useSettings()
  const now = useNow()
  const p = React.useMemo(() => (a ? plan(a, now, tz, balance, risk ?? DEFAULT_RISK) : null), [a, now, tz, balance, risk])
  useDailyNotification(accountId, p, now, tz)
  // "Once a day": show on the first visit of the day only. Decided once per visit, so the card never disappears
  // while you read it.
  const [seen, setSeen] = React.useState<boolean | null>(null)
  if (p && seen === null) setSeen(storage.get(seenKey(accountId)) === p.day)
  const day = p?.day
  React.useEffect(() => {
    if (day && seen === false && settings.reminder === "daily") storage.set(seenKey(accountId), day)
  }, [accountId, day, seen, settings.reminder])
  if (!p || settings.reminder === "off" || (settings.reminder === "daily" && seen)) return null

  const r = p.rules
  return (
    <Shell date={p.date} verdict={p.verdict} className={className}>
      <TradesLeft n={p.n} cap={p.L.trades} left={p.left} />
      {/* A list beside Net P&L or on a phone. Four columns when the card spans the page. */}
      <dl className="grid grid-cols-1 divide-y border-t @3xl:grid-cols-4 @3xl:gap-x-6 @3xl:divide-y-0 @3xl:pt-5">
        <Row label="P&L">
          <span className={cn("tabular-nums", p.n ? pnlClass(p.dayNet) : "text-muted-foreground")}>{p.n ? money(p.dayNet, true) : "None"}</span>
        </Row>
        <Row label="Max loss">
          {p.L.daily !== null ? (
            <>
              <span className="block tabular-nums">{money(p.L.daily)}</span>
              <span className="block text-xs text-muted-foreground">
                {!p.lossHit && p.dayNet < 0 ? `${money(p.L.daily + p.dayNet)} left` : source(p)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">{p.risk.kind === "percent" && p.risk.daily ? "Needs deposits" : "None"}</span>
          )}
        </Row>
        <Row label="Per trade">
          {p.L.perTrade !== null ? <span className="tabular-nums">{money(p.L.perTrade)}</span> : <span className="text-muted-foreground">None</span>}
        </Row>
        {r ? (
          <>
            <Row label="Hours">
              {p.bestHours.length > 0 && <span className="block">Best {p.bestHours.map(hourLabel).join(", ")}</span>}
              {r.skipHours.length > 0 && <span className="block">Skip {[...r.skipHours].sort((x, y) => x - y).map(hourLabel).join(", ")}</span>}
              {!p.bestHours.length && !r.skipHours.length && "Any"}
              {p.nowTag && <span className={cn("mt-0.5 block text-xs font-medium", toneClass(p.nowTag.tone))}>{p.nowTag.text}</span>}
            </Row>
            <Row label="Best">
              {p.bestDays.length > 0 && <span className="block">{p.bestDays.join(", ")}</span>}
              {p.symbol && <span className="block">{p.symbol}</span>}
              {p.hold && <span className="block">Hold {p.hold}</span>}
              {!p.bestDays.length && !p.symbol && !p.hold && "None"}
            </Row>
          </>
        ) : (
          <Row label="Best">
            <span className="text-muted-foreground">{p.locked ? "Upgrade" : "More data"}</span>
          </Row>
        )}
      </dl>
    </Shell>
  )
}

/** Where the max loss comes from, in one word. */
function source(p: { L: Limits; risk: AccountRisk }) {
  if (p.L.from === "plan") return "Plan"
  return p.risk.kind === "percent" ? `${p.risk.daily}%` : "Fixed"
}

/** The big number: trades left with one segment per allowed trade, or trades taken when there is no cap. */
function TradesLeft({ n, cap, left }: { n: number; cap: number | null; left: number | null }) {
  if (cap === null || left === null)
    return (
      <p className="flex items-baseline gap-2">
        <span className="font-display text-5xl font-bold tracking-tight tabular-nums">{n}</span>
        <span className="text-sm text-muted-foreground">{n === 1 ? "trade" : "trades"} today</span>
      </p>
    )
  return (
    <div>
      <p className="flex items-baseline gap-2">
        <span className={cn("font-display text-5xl font-bold tracking-tight tabular-nums", left === 0 && "text-loss")}>{left}</span>
        <span className="text-sm text-muted-foreground">of {plural(cap, "trade")} left</span>
      </p>
      {cap <= 20 && (
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

function Shell({ date, verdict, className, children }: { date: string; verdict: Verdict | null; className?: string; children: React.ReactNode }) {
  const tone = TONE[verdict?.tone ?? "normal"]
  return (
    <section
      aria-label="Today"
      className={cn("@container relative isolate flex min-w-0 flex-col gap-5 overflow-hidden rounded-xl border bg-card p-5 shadow-card lg:p-6", tone.edge, className)}
    >
      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b to-transparent", tone.wash)} />
      <header className="min-w-0 space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Today, {date}</p>
        <h2 className={cn("font-display text-3xl leading-tight font-bold", tone.text)}>{verdict?.label ?? "Today"}</h2>
        {verdict && <p className="text-sm text-muted-foreground">{verdict.why}</p>}
      </header>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 py-3 last:pb-0 @3xl:block @3xl:py-0">
      <dt className="flex-none text-sm text-muted-foreground @3xl:text-xs">{label}</dt>
      <dd className="min-w-0 text-right text-sm @3xl:mt-0.5 @3xl:text-left">{children}</dd>
    </div>
  )
}
