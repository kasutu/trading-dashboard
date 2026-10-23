import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { MetricBlock } from "@/components/dashboard/panel"
import { Button } from "@/components/ui/button"
import { useTrades } from "@/hooks/use-api"
import type { Filters, LocalTrade } from "@/lib/api/types"
import { addMonths, monthGrid, monthOf, monthTitle } from "@/lib/calendar"
import { WEEKDAYS, money, plural, today } from "@/lib/format"
import { CalendarDay } from "./calendar-day"
import { CalendarShare } from "./calendar-share"
import { DaySheet } from "./day-sheet"

type Props = { accountId: string; filters: Filters; period: [string, string] }

/** Month calendar of daily net P&L. Only months inside the data period, and the current month (for today's journal), can be shown. */
export function TradeCalendar({ accountId, filters, period }: Props) {
  const first = monthOf(period[0])
  const now = today(filters.tz)
  const dataLast = monthOf(period[1])
  const last = monthOf(now) > dataLast ? monthOf(now) : dataLast
  const [picked, setPicked] = React.useState<string | null>(null)
  const month = picked && picked >= first && picked <= last ? picked : dataLast
  const grid = monthGrid(month)
  const [open, setOpen] = React.useState<string | null>(null)

  // ponytail: 500 is the API maximum. A month with more trades shows only the newest 500.
  const { data, error } = useTrades(accountId, filters, { from: grid[0], to: grid.at(-1)!, pageSize: 500 })
  const byDay = React.useMemo(() => {
    const m = new Map<string, LocalTrade[]>()
    for (const t of [...(data?.rows ?? [])].reverse()) m.set(t.day, [...(m.get(t.day) ?? []), t])
    return m
  }, [data])

  const inMonth = grid.filter((d) => monthOf(d) === month).flatMap((d) => byDay.get(d) ?? [])
  const monthNet = inMonth.reduce((s, t) => s + t.net, 0)

  return (
    <div className="space-y-4">
      {/* The month's net P&L is the headline; the arrows move between months. */}
      <div className="flex items-start gap-2">
        <h4 className="sr-only">{monthTitle(month)}</h4>
        <MetricBlock
          className="min-w-0 flex-1"
          metric={{
            value: inMonth.length ? money(monthNet, true) : "—",
            tone: inMonth.length ? monthNet : undefined,
            label: `${monthTitle(month)} · ${inMonth.length ? plural(inMonth.length, "trade") : "no trades"}`,
          }}
        />
        <div className="-mr-2 flex flex-none sm:mr-0 sm:gap-1">
          <Button variant="ghost" size="icon-sm" disabled={month <= first} onClick={() => setPicked(addMonths(month, -1))} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={month >= last} onClick={() => setPicked(addMonths(month, 1))} aria-label="Next month">
            <ChevronRight />
          </Button>
          {data && <CalendarShare month={month} grid={grid} byDay={byDay} filters={filters} />}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-xs text-muted-foreground">{w}</div>
        ))}
        {grid.map((d, i) => (
          <CalendarDay
            key={d}
            day={d}
            trades={byDay.get(d) ?? []}
            inMonth={monthOf(d) === month}
            weekend={i % 7 >= 5}
            isToday={d === now}
            onOpen={() => setOpen(d)}
          />
        ))}
      </div>

      <DaySheet accountId={accountId} day={open} trades={open ? byDay.get(open) ?? [] : []} tz={filters.tz} onClose={() => setOpen(null)} />
    </div>
  )
}
