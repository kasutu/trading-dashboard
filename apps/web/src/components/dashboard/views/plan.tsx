import { CircleCheck, CircleAlert } from "lucide-react"
import { CompareChart } from "@/components/charts/compare-chart"
import { Panel } from "@/components/dashboard/panel"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useNarrow } from "@/hooks/use-media"
import type { Comparison, FocusItem, Optimization } from "@/lib/api/types"
import { WEEKDAYS, formatPeriod, hourLabel, money, pct, plural, pnlClass } from "@/lib/format"
import { cn } from "@/lib/utils"

/** What to focus on (primary), then the limits found by the optimizer (secondary). Both are found on your earlier days
 *  (the first 70% of trading days) and checked on your recent days (the rest), which they never saw. */
export function Plan({ opt }: { opt: Optimization | null }) {
  if (!opt)
    return (
      <Panel title="Trading plan">
        <p className="text-sm text-muted-foreground">The plan needs 10 or more trading days and 30 or more trades.</p>
      </Panel>
    )

  const range = formatPeriod
  const testGain = opt.test.withRules.net - opt.test.actual.net
  const allGain = opt.all.withRules.net - opt.all.actual.net
  const tested = opt.focus.filter((f) => f.test.trades > 0)
  const held = tested.filter((f) => f.test.net > 0).length
  // The recent days: every trading day from the split on (the curve has one point per day).
  const recent = plural(opt.curve.filter((p) => p.key >= opt.splitDay).length, "day")
  const limits = [opt.rules.skipHours.length, opt.rules.skipWeekdays.length, opt.rules.cap !== null, opt.rules.lossLimit !== null].filter(Boolean).length

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel
        title="Focus on"
        metric={
          opt.focus.length
            ? {
                value: tested.length ? `${held} of ${tested.length}` : plural(opt.focus.length, "idea"),
                tone: tested.length ? (held * 2 >= tested.length ? "profit" : "loss") : undefined,
                label: tested.length ? `Still worked on your last ${recent}` : `Not traded on your last ${recent} yet`,
              }
            : undefined
        }
        description={`Rules are found on your earlier days (${range(opt.trainDays)}), then checked on your recent days (${range(opt.testDays)}).`}
        className="lg:col-span-3"
      >
        <FocusList items={opt.focus} />
      </Panel>

      <Panel
        title="Limit these"
        metric={{ value: limits ? plural(limits, "limit") : "No limits", label: `Best of ${opt.tested} sets tested` }}
        description="Jurno kept the set with the highest net P&L. Each set keeps 40% or more of your trades."
      >
        <RuleList rules={opt.rules} />
      </Panel>

      <Panel
        title="Checked on your recent days"
        metric={{
          value: money(testGain, true),
          tone: testGain,
          label: `Change on your last ${recent}`,
          stats: [["Actual", money(opt.test.actual.net, true)], ["With limits", money(opt.test.withRules.net, true)]],
        }}
        description={
          <>
            The limits were found on your earlier days and never saw {range(opt.testDays)}.{" "}
            {testGain > 0
              ? "They also helped on these days: a good sign that they are not a fluke of your earlier days."
              : "They did not help on these days. They probably matched chance patterns in your earlier days. Collect more trades and check again."}
            {opt.all.withRules.net < 0 && " Your net P&L stays negative with these limits. They reduce losses but do not make the strategy profitable."}
          </>
        }
        className="lg:col-span-2"
      />

      <Panel
        title="Net P&L with and without the limits"
        metric={{
          value: money(opt.all.withRules.net, true),
          tone: opt.all.withRules.net,
          label: "With limits, all days",
          stats: [["Actual", money(opt.all.actual.net, true)]],
        }}
        description="Cumulative, by day."
        className="lg:col-span-3"
      >
        <CompareChart data={opt.curve} splitDay={opt.splitDay} />
        <div className="mt-3 flex gap-5 text-xs text-muted-foreground">
          <Legend className="bg-brand" label="With limits" />
          <Legend className="bg-muted-foreground" label="Actual" />
        </div>
      </Panel>

      <Panel
        title="Results by period"
        metric={{ value: money(allGain, true), tone: allGain, label: "Change on all days" }}
        description="This check assumes each trade is independent. Past results do not guarantee future results."
        className="lg:col-span-3"
      >
        <ResultsTable rows={[["Earlier days", opt.train], ["Recent days", opt.test], ["All days", opt.all]]} />
      </Panel>
    </div>
  )
}

const FOCUS_LABEL = { hour: "Best hours", weekday: "Best weekdays", symbol: "Best symbol", duration: "Best holding time" } as const
const focusValue = (f: FocusItem) => (f.kind === "hour" ? f.keys.map(hourLabel) : f.keys).join(", ")

function FocusList({ items }: { items: FocusItem[] }) {
  if (!items.length)
    return <p className="text-sm text-muted-foreground">No hour, weekday, symbol or holding time made money on your earlier days.</p>
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((f) => {
        const held = f.test.net > 0
        return (
          <div key={f.kind} className="min-w-0 border-t pt-4">
            <p className="text-xs text-muted-foreground">{FOCUS_LABEL[f.kind]}</p>
            <p className="mt-0.5 font-medium break-words">{focusValue(f)}</p>
            <dl className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Earlier days</dt>
                <dd className="tabular-nums">{money(f.fit.net, true)} on {plural(f.fit.trades, "trade")}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Recent days</dt>
                <dd className={cn("flex items-center gap-1 tabular-nums", f.test.trades ? pnlClass(f.test.net) : "text-muted-foreground")}>
                  {f.test.trades ? money(f.test.net, true) : "No trades"}
                  {f.test.trades > 0 && (held ? <CircleCheck className="size-3.5" aria-label="Held" /> : <CircleAlert className="size-3.5" aria-label="Did not hold" />)}
                </dd>
              </div>
            </dl>
          </div>
        )
      })}
    </div>
  )
}

function RuleList({ rules }: { rules: Optimization["rules"] }) {
  const items = [
    ["Hours", rules.skipHours.length ? `Skip ${rules.skipHours.map(hourLabel).join(", ")}` : null],
    ["Weekdays", rules.skipWeekdays.length ? `Skip ${rules.skipWeekdays.map((d) => WEEKDAYS[d]).join(", ")}` : null],
    ["Daily trade cap", rules.cap !== null ? `Stop after ${plural(rules.cap, "trade")}` : null],
    ["Daily loss limit", rules.lossLimit !== null ? `Stop at −$${rules.lossLimit}` : null],
  ] as const
  return (
    <ul className="divide-y">
      {items.map(([label, value]) => (
        <li key={label} className="py-3 first:pt-0 last:pb-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {value ? <p className="mt-0.5 text-sm">{value}</p> : <p className="mt-0.5 text-sm text-muted-foreground">No change</p>}
        </li>
      ))}
    </ul>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-0.5 w-4 rounded-full", className)} /> {label}
    </span>
  )
}

const num = "text-right font-mono tabular-nums"

/** A table from md, a list on phones. */
function ResultsTable({ rows }: { rows: [string, Comparison][] }) {
  const narrow = useNarrow()
  if (narrow)
    return (
      <ul className="divide-y">
        {rows.map(([label, { actual, withRules }]) => {
          const gain = withRules.net - actual.net
          return (
            <li key={label} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm">{label}</span>
                <span className={cn("font-mono text-sm tabular-nums", pnlClass(gain))}>{money(gain, true)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {money(actual.net, true)} → {money(withRules.net, true)}, {actual.trades} → {withRules.trades} trades, {pct(actual.winRate)} → {pct(withRules.winRate)} won
              </p>
            </li>
          )
        })}
      </ul>
    )
  const head = "text-xs font-normal text-muted-foreground"
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(head, "px-0")}>Period</TableHead>
          <TableHead className={cn(head, "text-right")}>Trades</TableHead>
          <TableHead className={cn(head, "text-right")}>Win rate</TableHead>
          <TableHead className={cn(head, "text-right")}>Actual</TableHead>
          <TableHead className={cn(head, "text-right")}>With limits</TableHead>
          <TableHead className={cn(head, "pr-0 text-right")}>Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([label, { actual, withRules }]) => {
          const gain = withRules.net - actual.net
          return (
            <TableRow key={label}>
              <TableCell className="px-0">{label}</TableCell>
              <TableCell className={cn(num, "text-muted-foreground")}>{actual.trades} → {withRules.trades}</TableCell>
              <TableCell className={cn(num, "text-muted-foreground")}>{pct(actual.winRate)} → {pct(withRules.winRate)}</TableCell>
              <TableCell className={num}>{money(actual.net, true)}</TableCell>
              <TableCell className={num}>{money(withRules.net, true)}</TableCell>
              <TableCell className={cn(num, "pr-0", pnlClass(gain))}>{money(gain, true)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
