import * as React from "react"
import { Upload } from "lucide-react"
import { Link } from "wouter"
import { InsightCard } from "@/components/dashboard/insight-card"
import { KpiStrip, SummaryCard } from "@/components/dashboard/summary-card"
import { TodayView } from "@/components/dashboard/today-card"
import { ChoiceChips, MultiChips } from "@/components/journal/chips"
import { MoodPicker } from "@/components/journal/mood-picker"
import { Button } from "@/components/ui/button"
import type { Mood } from "@/lib/api/types"
import { LOCAL_TZ } from "@/lib/format"
import { SAMPLE, SAMPLE_INSIGHTS, sampleToday } from "./landing-sample"

/** First screen for signed-out visitors: what Jurno does, shown with the real dashboard parts on sample data. */
export function Landing() {
  return (
    <div className="pt-6 pb-16 sm:pt-14">
      <section className="max-w-3xl">
        <p className="text-sm font-medium text-muted-foreground">For MetaTrader 5 and CSV trade histories</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-balance sm:text-6xl">A trade journal that fills in the numbers for you.</h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
          Import your broker's trade history, and Jurno builds your journal and stats from it. You add the one thing a file can't tell: why
          you took the trade.
        </p>
        <Cta className="mt-8" />
      </section>

      {/* The real dashboard cards, on made-up numbers. */}
      <section aria-label="Dashboard preview" className="mt-12 sm:mt-16">
        <div className="flex flex-col gap-4 rounded-2xl border bg-muted/40 p-3 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row">
            <SummaryCard a={SAMPLE} tz={LOCAL_TZ} className="xl:flex-[3]" />
            <TodayView p={sampleToday()} className="xl:flex-[2]" />
          </div>
          <KpiStrip a={SAMPLE} />
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">Sample account. Not real results.</p>
      </section>

      <div className="mt-20 space-y-20 sm:mt-28 sm:space-y-28">
        <Step
          n={1}
          title="Import instead of typing"
          text="Upload the MT5 report from Exness, or a CSV from another broker after you match its columns. From the MT5 report, Jurno reads every trade, deposit and withdrawal. A new import skips the trades you already have."
        >
          <ImportReceipt />
        </Step>
        <Step
          n={2}
          title="Review a trade in seconds"
          text="Pick how you felt, the setup and any mistakes. Just tap, no typing. Reviewing is free. Seeing which setups and moods make you money is on Espresso and Latte."
        >
          <ReviewSample />
        </Step>
        <Step
          n={3}
          title="Get advice from your own trades"
          text="Jurno finds the hours and days that lose you money, and the trade caps and loss limits that would have helped. Each finding is one action, like these. Included in Espresso and Latte."
          wide
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {SAMPLE_INSIGHTS.map((i) => <InsightCard key={i.title} insight={i} share={false} />)}
          </div>
        </Step>
      </div>

      <section className="mt-24 rounded-2xl border bg-card px-6 py-12 text-center shadow-card sm:mt-32 sm:py-16">
        <h2 className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">Start with last month's trades.</h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">The free plan includes one trading account, the dashboard and the journal.</p>
        <Cta className="mt-8 sm:justify-center" />
      </section>
    </div>
  )
}

function Cta({ className }: { className?: string }) {
  return (
    <div className={`grid gap-3 sm:flex sm:flex-wrap sm:items-center ${className ?? ""}`}>
      <Button size="lg" asChild><Link href="/sign-up">Create a free account</Link></Button>
      <Button size="lg" variant="outline" asChild><Link href="/sign-in">Sign in</Link></Button>
      <Link
        href="/pricing"
        className="flex min-h-11 items-center justify-center rounded-sm px-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        See plans and prices
      </Link>
    </div>
  )
}

/** A numbered step: text on one side, its sample on the other. `wide`: the sample goes under the text, full width. */
function Step({ n, title, text, wide, children }: { n: number; title: string; text: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={wide ? "space-y-8" : "grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-12"}>
      <div className="max-w-md">
        <p className="font-mono text-sm text-muted-foreground tabular-nums">0{n}</p>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance">{title}</h2>
        <p className="mt-3 text-muted-foreground">{text}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

const IMPORTED = [
  ["XAUUSD", "Buy", "0.10", 42.1],
  ["XAUUSD", "Sell", "0.10", -18.4],
  ["EURUSD", "Buy", "0.50", 27.75],
  ["XAUUSD", "Buy", "0.20", 61.3],
] as const

/** What an import looks like: the summary line and the newest trades. */
function ImportReceipt() {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-muted"><Upload className="size-4" /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">ReportHistory-5001234.xlsx</p>
          <p className="text-xs text-muted-foreground">MetaTrader 5 report</p>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-4 border-t pt-4">
        {[["Trades added", "180"], ["Deposits", "3"], ["Already stored", "0"]].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 font-mono text-lg tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <table className="mt-5 w-full border-t text-sm">
        <caption className="sr-only">Newest imported trades</caption>
        <tbody>
          {IMPORTED.map(([sym, side, lots, net], k) => (
            <tr key={k} className="border-b last:border-0">
              <td className="py-2.5 font-mono">{sym}</td>
              <td className="py-2.5 text-muted-foreground">{side} {lots} lots</td>
              <td className={`py-2.5 text-right font-mono tabular-nums ${net >= 0 ? "text-profit" : "text-loss"}`}>{net >= 0 ? "+" : "−"}${Math.abs(net).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const SETUPS = [{ value: "breakout", label: "Breakout" }, { value: "pullback", label: "Pullback" }, { value: "range", label: "Range" }]
const MISTAKES = [{ value: "early", label: "Entered early" }, { value: "moved", label: "Moved stop" }, { value: "size", label: "Too big" }, { value: "fomo", label: "FOMO" }]

/** A working review card on a sample trade. Nothing here is saved. */
function ReviewSample() {
  const [mood, setMood] = React.useState<Mood | null>(4)
  const [setup, setSetup] = React.useState<string | null>("pullback")
  const [mistakes, setMistakes] = React.useState<string[]>([])
  return (
    <div className="rounded-xl border bg-card p-5 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold"><span className="font-mono">XAUUSD</span> Buy 0.10 lots</p>
        <p className="font-mono text-sm text-profit tabular-nums">+$42.10</p>
      </div>
      <p className="text-xs text-muted-foreground">Today, 9:42 AM to 10:08 AM</p>
      <div className="mt-5 space-y-4 border-t pt-4">
        <div>
          <p className="mb-2 text-xs text-muted-foreground">How did you feel?</p>
          <MoodPicker value={mood} onChange={setMood} />
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Setup</p>
          <ChoiceChips label="Setup" options={SETUPS} value={setup} onChange={setSetup} size="sm" />
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Mistakes</p>
          <MultiChips label="Mistakes" options={MISTAKES} value={mistakes} onChange={setMistakes} size="sm" />
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Try it. Nothing here is saved.</p>
    </div>
  )
}
