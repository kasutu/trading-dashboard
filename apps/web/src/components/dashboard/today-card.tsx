import * as React from "react"
import { useToday } from "@/hooks/use-api"
import { useSettings } from "@/hooks/use-settings"
import type { TodayPlan } from "@/lib/api/types"
import { money, plural, pnlClass } from "@/lib/format"
import { storage } from "@/lib/storage"
import { cn } from "@/lib/utils"

const seenKey = (accountId: string) => `jurno:today-seen:${accountId}`
const notifiedKey = (accountId: string) => `jurno:today-notified:${accountId}`
/** The trades meter shows one segment per trade up to this cap. More segments are noise. */
const METER_MAX = 10
/** The plan changes with the hour (good and bad hours), so fetch it again this often. */
const REFRESH_MS = 5 * 60_000

/** "HH:MM" now in the timezone. */
function timeIn(tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date())
}

/** One browser notification a day at the time set in Settings, while Jurno is open in a tab. */
function useDailyNotification(accountId: string, p: TodayPlan | null, tz: string) {
  const { settings } = useSettings()
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])
  React.useEffect(() => {
    if (!p || !settings.reminderNotify || typeof Notification === "undefined" || Notification.permission !== "granted") return
    if (timeIn(tz) < settings.reminderTime || storage.get(notifiedKey(accountId)) === p.day) return
    storage.set(notifiedKey(accountId), p.day)
    const body = [p.verdict.why, ...p.rules.slice(0, 2).map((r) => `${r.text}.`)].join(" ")
    try {
      new Notification(p.verdict.label, { body, tag: `jurno-today-${accountId}`, icon: "/favicon.svg" })
    } catch {
      // Some mobile browsers allow notifications only from a service worker.
    }
  }, [accountId, p, tz, tick, settings.reminderNotify, settings.reminderTime])
}

/** The daily reminder for a trading account: what to do today, today's rules, and questions to ask before each
 *  trade. The server works it out (engine::today), so the card and the reminder email say the same thing. */
export function TodayCard({ accountId, tz, className }: { accountId: string; tz: string; className?: string }) {
  const { settings } = useSettings()
  const { data, refetch } = useToday(accountId, tz)
  React.useEffect(() => {
    const id = window.setInterval(refetch, REFRESH_MS)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, tz])
  const p = data && !("empty" in data) ? data : null
  useDailyNotification(accountId, p, tz)
  // "Daily": show on the first visit of the day only. Decided once per visit, so the card never disappears while
  // you read it.
  const [seen, setSeen] = React.useState<boolean | null>(null)
  if (p && seen === null) setSeen(storage.get(seenKey(accountId)) === p.day)
  const day = p?.day
  React.useEffect(() => {
    if (day && seen === false && settings.reminder === "daily") storage.set(seenKey(accountId), day)
  }, [accountId, day, seen, settings.reminder])
  if (!p || settings.reminder === "off" || (settings.reminder === "daily" && seen)) return null
  return <TodayView p={p} className={className} />
}

/** The card itself. Also shown on the landing page with a sample plan. */
export function TodayView({ p, className }: { p: TodayPlan; className?: string }) {
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
function Trades({ p }: { p: TodayPlan }) {
  const cap = p.limits.trades
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
        <span className={big}>{p.trades}</span>
        <span className="text-sm text-muted-foreground">{p.trades === 1 ? "trade" : "trades"} today, no trade limit</span>
      </p>
    )
  const left = p.left
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn(big, left === 0 && "text-loss")}>{left}</span>
        <span className="text-sm text-muted-foreground">of {plural(cap, "trade")} left</span>
        {p.trades > 0 && <span className={cn("text-sm tabular-nums", pnlClass(p.dayNet))}>{money(p.dayNet, true)} today</span>}
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

function Shell({ date, verdict, className, children }: { date: string; verdict: TodayPlan["verdict"]; className?: string; children: React.ReactNode }) {
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
