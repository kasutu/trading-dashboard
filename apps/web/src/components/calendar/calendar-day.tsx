import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { SideBadge } from "@/components/dashboard/side-badge"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { useJournalContext } from "@/hooks/use-journal"
import type { LocalTrade } from "@/lib/api/types"
import { compactMoney, formatDay, money, plural, pnlClass, tradeKey } from "@/lib/format"
import { firstLine, moodOf } from "@/lib/journal"
import { cn } from "@/lib/utils"

type Props = {
  day: string
  trades: LocalTrade[]
  inMonth: boolean
  weekend: boolean
  isToday: boolean
  onOpen: () => void
}

// Narrow screens: no dollar sign or cents, "+12", "−1.2k".
const short = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${compactMoney(Math.abs(n))}`

/** One day box: day number, net P&L, trade count and how you felt before trading. Hover lists the trades, click opens the day.
 *  Today and days with a day review open too, even without trades. */
export function CalendarDay({ day, trades, inMonth, weekend, isToday, onOpen }: Props) {
  const n = trades.length
  const entry = useJournalContext()?.days.get(day)
  const mood = moodOf(entry?.preMood)
  const net = trades.reduce((s, t) => s + t.net, 0)
  // Empty days stay quiet (no border, faint fill) so trading days stand out.
  const tint = !n
    ? "border-transparent bg-muted/40"
    : net > 0 ? "border-profit/25 bg-profit/10" : net < 0 ? "border-loss/25 bg-loss/10" : "border-border bg-card"
  const box = "relative flex min-h-14 min-w-0 flex-col gap-0.5 rounded-xl border p-1 text-left sm:min-h-24 sm:p-2.5"
  const number = (
    <span
      className={cn("w-fit font-mono text-xs text-muted-foreground", isToday && "rounded bg-foreground px-1 font-semibold text-background")}
      aria-label={isToday ? "Today" : undefined}
    >
      {day.slice(8)}
    </span>
  )
  const face = mood && (
    <span aria-hidden className="absolute top-1 right-1 text-[11px] leading-none sm:top-2 sm:right-2 sm:text-sm">{mood.emoji}</span>
  )
  const opens = "cursor-pointer transition-[border-color,transform] duration-150 ease-out hover:border-foreground/25 active:scale-[0.98] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
  const moodLabel = mood ? `, feeling ${mood.label.toLowerCase()}` : ""

  if (!n && (isToday || entry))
    return (
      <button
        type="button"
        onClick={onOpen}
        title={firstLine(entry?.note) || undefined}
        aria-label={`${formatDay(day, true)}: no trades${moodLabel}`}
        className={cn(box, tint, !inMonth && "opacity-40", opens, "hover:bg-muted/70")}
      >
        {number}
        {face}
        <span className="mt-auto hidden text-xs text-muted-foreground sm:block">{entry ? "No trades" : "How did it go?"}</span>
      </button>
    )

  if (!n)
    return (
      <div className={cn(box, tint, !inMonth && "opacity-40")}>
        {number}
        {weekend && <span className="mt-auto hidden text-xs text-muted-foreground sm:block">Weekend</span>}
      </div>
    )

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${formatDay(day, true)}: ${money(net, true)}, ${plural(n, "trade")}${moodLabel}`}
          className={cn(box, tint, !inMonth && "opacity-40", opens)}
        >
          {number}
          {face}
          <span className={cn("mt-auto truncate font-mono text-[11px] font-medium tabular-nums sm:text-sm", pnlClass(net))}>
            <span className="sm:hidden">{short(net)}</span>
            <span className="hidden sm:inline">{money(net, true)}</span>
          </span>
          <span className="hidden text-xs text-muted-foreground sm:block">{plural(n, "trade")}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="hidden w-72 p-0 sm:block">
        <div className="flex items-baseline justify-between gap-2 border-b px-3 py-2.5">
          <span className="text-sm font-medium">{formatDay(day, true)}</span>
          <span className={cn("font-mono text-sm font-medium tabular-nums", pnlClass(net))}>{money(net, true)}</span>
        </div>
        {(entry?.note || mood) && (
          <div className="flex items-start gap-2 border-b px-3 py-2.5 text-sm">
            {mood && <span aria-hidden className="leading-5">{mood.emoji}</span>}
            <p className="line-clamp-2 text-muted-foreground">{entry?.note || mood?.label}</p>
          </div>
        )}
        <ul className="max-h-64 overflow-y-auto px-3 py-1.5">
          {trades.map((t) => (
            <li key={tradeKey(t)} className="flex items-center gap-2 py-1.5 text-sm">
              {t.net >= 0 ? <ArrowUpRight className="size-4 text-profit" /> : <ArrowDownRight className="size-4 text-loss" />}
              <span className={cn("w-20 font-mono tabular-nums", pnlClass(t.net))}>{money(t.net, true)}</span>
              <span className="flex-1 truncate">{t.symbol}</span>
              <SideBadge side={t.side} />
            </li>
          ))}
        </ul>
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">Click the day to see each trade.</p>
      </HoverCardContent>
    </HoverCard>
  )
}
