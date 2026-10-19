import { CalendarClock, FileSpreadsheet, Target } from "lucide-react"
import { Link } from "wouter"
import { Button } from "@/components/ui/button"

const FEATURES = [
  { icon: CalendarClock, title: "Timing", text: "Net P&L by hour, weekday and holding time." },
  { icon: Target, title: "Habits", text: "Daily trade caps, loss limits and trades after a loss." },
  { icon: FileSpreadsheet, title: "Any broker", text: "Exness exports work as they are. Match the columns of any other CSV file once." },
]

/** First screen for signed-out visitors: what Jurno does and how to start. */
export function Landing() {
  return (
    <div className="mx-auto max-w-3xl pt-10 pb-16 sm:pt-16">
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
        See which habits <span className="marker">cost you money</span>.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">
        Add your broker trade history. Jurno charts your results and shows what to change.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button size="lg" asChild><Link href="/sign-up">Create a free account</Link></Button>
        <Button size="lg" variant="outline" asChild><Link href="/sign-in">Sign in</Link></Button>
        <Link href="/pricing" className="rounded-sm px-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
          See pricing
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
