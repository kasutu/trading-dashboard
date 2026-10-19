import { CalendarDays, FileSpreadsheet, Target } from "lucide-react"
import { Link } from "wouter"
import { Button } from "@/components/ui/button"

const FEATURES = [
  { icon: CalendarDays, title: "Trading calendar", text: "Net P&L for each day. Select a day to see every trade." },
  { icon: Target, title: "Timing and habits", text: "Results by hour, weekday and holding time. Trade caps and loss limits tested on your trades. Included in Espresso and Latte." },
  { icon: FileSpreadsheet, title: "Any broker", text: "Exness exports import as they are. For another broker, match the columns to the fields Jurno needs." },
]

/** First screen for signed-out visitors: what Jurno does and how to start. */
export function Landing() {
  return (
    <div className="mx-auto max-w-3xl pt-10 pb-16 sm:pt-16">
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
        See which habits <span className="marker">cost you money</span>.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        Import the trade history from your broker. Jurno shows where you make and lose money, by day, symbol and
        position size. Paid plans also test rules such as a daily loss limit on your own trades.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button size="lg" asChild><Link href="/sign-up">Create a free account</Link></Button>
        <Button size="lg" variant="outline" asChild><Link href="/sign-in">Sign in</Link></Button>
        <Link href="/pricing" className="rounded-sm px-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          See plans and prices
        </Link>
      </div>

      <ul className="mt-14 grid gap-6 border-t pt-10 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="space-y-1.5">
            <Icon className="size-4 text-muted-foreground" />
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">{text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
