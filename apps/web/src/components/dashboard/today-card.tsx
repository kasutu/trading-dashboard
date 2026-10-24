import * as React from "react"
import { useApi } from "@/hooks/use-api"
import { useSettings } from "@/hooks/use-settings"
import { filterQuery } from "@/lib/api/client"
import type { Analytics, AnalyticsResponse, Filters } from "@/lib/api/types"
import { WEEKDAYS, hourLabel, money, plural, pnlClass } from "@/lib/format"
import { storage } from "@/lib/storage"
import { cn } from "@/lib/utils"
import { toneClass, type Metric } from "./metrics"

const LONG_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
const seenKey = (accountId: string) => `jurno:today-seen:${accountId}`
const notifiedKey = (accountId: string) => `jurno:today-notified:${accountId}`

/** The time now, updated every minute, so the hour advice and the notification stay current while the app is open. */
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

/** The account's analytics on all trades, whatever the filter bar says, so the plan does not change with the filters.
 *  Reuses the dashboard's data when its filters are already "all". */
function useAllAnalytics(accountId: string, filters: Filters, data: AnalyticsResponse | undefined, enabled: boolean) {
  const all = filters.range === "all" && filters.symbol === "all" && filters.side === "all"
  const path = enabled && !all ? `/accounts/${accountId}/analytics?${filterQuery({ ...filters, range: "all", symbol: "all", side: "all" })}` : null
  const own = useApi<AnalyticsResponse>(path)
  const res = all ? data : own.data
  // Keep the last result while a new one loads, so the card does not blink when the filters change.
  const [last, setLast] = React.useState<Analytics | null>(null)
  const a = res && !("empty" in res) ? res : null
  if (a && a !== last) setLast(a)
  return a ?? last
}

type Verdict = { label: string; tone?: "profit" | "loss"; why: string }

/** Everything the card and the notification say about today. */
function plan(a: Analytics, now: Date, tz: string) {
  const { day, weekday, hour } = clock(now, tz)
  const longDay = LONG_DAYS[weekday] ?? "Today"
  const done = a.daily.find((d) => d.key === day)
  const n = done?.trades ?? 0
  const dayNet = done?.net ?? 0
  const date = now.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" })
  const base = { day, date, n, dayNet }

  const full = a.locked ? null : a
  const opt = full?.optimization
  if (!full || !opt) return { ...base, locked: !!a.locked, rules: null }

  const r = opt.rules
  const keys = (kind: string) => opt.focus.find((f) => f.kind === kind)?.keys ?? []
  const bestDays = keys("weekday")
  const bestHours = keys("hour").map(Number)
  const wd = full.byWeekday.find((g) => g.key === WEEKDAYS[weekday])
  const record = wd && wd.trades ? `Your ${longDay}s: ${money(wd.net, true)} over ${plural(wd.trades, "trade")}.` : `No ${longDay} trades yet.`

  const capHit = r.cap !== null && n >= r.cap
  const lossHit = r.lossLimit !== null && dayNet <= -r.lossLimit
  const verdict: Verdict = capHit
    ? { label: "Done for today", tone: "loss", why: `You took ${n} of ${plural(r.cap!, "trade")}. Stop here.` }
    : lossHit
      ? { label: "Done for today", tone: "loss", why: `You are at ${money(dayNet, true)}, past your −$${r.lossLimit} limit. Stop here.` }
      : r.skipWeekdays.includes(weekday)
        ? { label: "Rest day", tone: "loss", why: `Your plan skips ${longDay}s. ${record}` }
        : bestDays.includes(WEEKDAYS[weekday])
          ? { label: "Best day", tone: "profit", why: `${longDay} is one of your best days. ${record}` }
          : { label: "Normal day", why: `${record} Stick to the plan.` }

  // Plain text, so the notification can reuse it.
  const metric: Metric & { value: string; label: string } =
    r.cap !== null
      ? { value: `${Math.max(r.cap - n, 0)} of ${r.cap}`, tone: capHit ? "loss" : undefined, label: "Trades left today" }
      : { value: String(n), label: "Trades today · no daily cap" }

  const nowTag = r.skipHours.includes(hour)
    ? { text: `Now (${hourLabel(hour)}) is a skip hour`, tone: "loss" as const }
    : bestHours.includes(hour)
      ? { text: `Now (${hourLabel(hour)}) is a best hour`, tone: "profit" as const }
      : null

  return {
    ...base,
    locked: false,
    rules: r,
    lossHit,
    verdict,
    metric,
    nowTag,
    bestDays,
    bestHours,
    symbol: keys("symbol")[0],
    hold: keys("duration")[0],
  }
}

/** One browser notification a day with the day's plan, at the time set in Settings, while Jurno is open in a tab. */
function useDailyNotification(accountId: string, p: ReturnType<typeof plan> | null, now: Date, tz: string) {
  const { settings } = useSettings()
  React.useEffect(() => {
    if (!p || !settings.reminderNotify || typeof Notification === "undefined" || Notification.permission !== "granted") return
    const { day, time } = clock(now, tz)
    if (time < settings.reminderTime || storage.get(notifiedKey(accountId)) === day) return
    storage.set(notifiedKey(accountId), day)
    const body = p.rules
      ? `${p.metric.value} ${p.metric.label.toLowerCase()}. ${p.verdict.why}`
      : `Today so far: ${p.n ? `${plural(p.n, "trade")}, ${money(p.dayNet, true)}` : "no trades yet"}.`
    try {
      new Notification(p.rules ? `Jurno · ${p.verdict.label}` : "Jurno · Today", { body, tag: `jurno-today-${accountId}`, icon: "/favicon.svg" })
    } catch {
      // Some mobile browsers only allow notifications from a service worker.
    }
  }, [accountId, p, now, tz, settings.reminderNotify, settings.reminderTime])
}

/** The daily reminder: what kind of day today is, how many trades are left, and when to stop. How often it shows and
 *  whether it sends a notification are set in Settings. */
export function TodayCard({ accountId, filters, data, className }: { accountId: string; filters: Filters; data: AnalyticsResponse | undefined; className?: string }) {
  const { settings } = useSettings()
  const now = useNow()
  const a = useAllAnalytics(accountId, filters, data, settings.reminder !== "off" || settings.reminderNotify)
  const p = React.useMemo(() => (a ? plan(a, now, filters.tz) : null), [a, now, filters.tz])
  useDailyNotification(accountId, p, now, filters.tz)
  // "Once a day": shown on the first visit of the day, hidden on later ones. Decided once per visit, so it never
  // disappears while you look at it.
  const [seen, setSeen] = React.useState<boolean | null>(null)
  if (p && seen === null) setSeen(storage.get(seenKey(accountId)) === p.day)
  const day = p?.day
  React.useEffect(() => {
    if (day && seen === false && settings.reminder === "daily") storage.set(seenKey(accountId), day)
  }, [accountId, day, seen, settings.reminder])
  if (!p || settings.reminder === "off" || (settings.reminder === "daily" && seen)) return null

  const soFar = (
    <span className={cn("tabular-nums", p.n ? pnlClass(p.dayNet) : "text-muted-foreground")}>
      {p.n ? `${plural(p.n, "trade")} · ${money(p.dayNet, true)}` : "No trades yet"}
    </span>
  )

  if (!p.rules)
    return (
      <Shell date={p.date} verdict={null} className={className}>
        <dl className="border-t"><Row label="Today so far">{soFar}</Row></dl>
        <p className="text-sm text-muted-foreground">
          {p.locked ? "Upgrade to see your best days, best hours and daily trade limit here." : "Your daily plan shows up after 10 trading days and 30 trades."}
        </p>
      </Shell>
    )

  const r = p.rules
  const left = r.cap !== null ? Math.max(r.cap - p.n, 0) : null
  return (
    <Shell date={p.date} verdict={p.verdict} className={className}>
      {r.cap !== null && left !== null ? (
        <div>
          <p className="flex items-baseline gap-2">
            <span className={cn("font-display text-5xl font-bold tracking-tight tabular-nums", left === 0 && "text-loss")}>{left}</span>
            <span className="text-sm text-muted-foreground">of {plural(r.cap, "trade")} left today</span>
          </p>
          {r.cap <= 20 && (
            // One segment per trade allowed: filled ones are still yours to take.
            <div className="mt-3 flex gap-1" aria-hidden>
              {Array.from({ length: r.cap }, (_, k) => (
                <span key={k} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", k < left ? "bg-foreground" : "bg-muted")} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="flex items-baseline gap-2">
          <span className="font-display text-5xl font-bold tracking-tight tabular-nums">{p.n}</span>
          <span className="text-sm text-muted-foreground">{p.n === 1 ? "trade" : "trades"} today · no daily cap</span>
        </p>
      )}
      {/* A list in a narrow card (beside Net P&L, or on a phone), four columns when it spans the page. */}
      <dl className="grid grid-cols-1 divide-y border-t @3xl:grid-cols-4 @3xl:gap-x-6 @3xl:divide-y-0 @3xl:pt-5">
        <Row label="Today so far">{soFar}</Row>
        <Row label="Daily loss limit">
          {r.lossLimit !== null ? (
            <>
              <span className="block">Stop at −${r.lossLimit}</span>
              {!p.lossHit && p.dayNet < 0 && <span className="block text-xs text-muted-foreground">${(r.lossLimit + p.dayNet).toFixed(2)} left</span>}
            </>
          ) : (
            "None"
          )}
        </Row>
        <Row label="Hours">
          {p.bestHours.length > 0 && <span className="block">Best: {p.bestHours.map(hourLabel).join(", ")}</span>}
          {r.skipHours.length > 0 && <span className="block">Skip: {[...r.skipHours].sort((x, y) => x - y).map(hourLabel).join(", ")}</span>}
          {!p.bestHours.length && !r.skipHours.length && "Any hour"}
          {p.nowTag && <span className={cn("mt-0.5 block text-xs font-medium", toneClass(p.nowTag.tone))}>{p.nowTag.text}</span>}
        </Row>
        <Row label="Play">
          {p.bestDays.length > 0 && <span className="block">Best days: {p.bestDays.join(", ")}</span>}
          {p.symbol && <span className="block">Symbol: {p.symbol}</span>}
          {p.hold && <span className="block">Hold: {p.hold}</span>}
          {!p.bestDays.length && !p.symbol && !p.hold && "No clear edge yet"}
        </Row>
      </dl>
    </Shell>
  )
}

/** Each kind of day gets its own color: a soft wash at the top, a tinted edge and the headline. Normal days use the
 *  brand amber, so the card stands out next to Net P&L every day. */
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
        <p className="text-xs font-medium text-muted-foreground">Today · {date}</p>
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
