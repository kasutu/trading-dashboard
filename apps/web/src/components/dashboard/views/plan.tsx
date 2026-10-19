import { CircleCheck, CircleAlert } from "lucide-react"
import { CompareChart } from "@/components/charts/compare-chart"
import { Panel } from "@/components/dashboard/panel"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Comparison, FocusItem, Optimization } from "@/lib/api/types"
import { WEEKDAYS, formatPeriod, hourLabel, money, pct, plural, pnlClass } from "@/lib/format"
import { cn } from "@/lib/utils"

/** What to focus on (primary), then the limits found by the optimizer (secondary), checked on days it did not see. */
export function Plan({ opt }: { opt: Optimization | null }) {
  if (!opt)
    return (
      <Panel title="Trading plan">
        <p className="text-sm text-muted-foreground">The plan needs 10 or more trading days and 30 or more trades.</p>
      </Panel>
    )

  const range = formatPeriod
  const testGain = opt.test.withRules.net - opt.test.actual.net

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel
        title="Focus on"
        description={`What made money on ${range(opt.trainDays)}. The test line shows if it held on ${range(opt.testDays)}.`}
        className="lg:col-span-3"
      >
        <FocusList items={opt.focus} />
      </Panel>

      <Panel
        title="Limit these"
        description={`Jurno tested ${opt.tested} sets of limits and kept the one with the highest net P&L. Each set keeps 40% or more of your trades.`}
      >
        <RuleList rules={opt.rules} />
      </Panel>

      <Panel
        title="Test on new days"
        description={`The limits were not fitted to ${range(opt.testDays)}. Use these days to judge them.`}
        className="lg:col-span-2"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Big label="Actual" value={money(opt.test.actual.net, true)} tone={pnlClass(opt.test.actual.net)} />
          <Big label="With limits" value={money(opt.test.withRules.net, true)} tone={pnlClass(opt.test.withRules.net)} />
          <Big label="Change" value={money(testGain, true)} tone={pnlClass(testGain)} emphasis />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {testGain > 0
            ? "The limits also helped on the test days. This is a good sign that they are not only a fit to old data."
            : "The limits did not help on the test days. They probably fit noise in the old data. Collect more trades and check again."}
          {opt.all.withRules.net < 0 && " Your net P&L stays negative with these limits. They reduce losses but do not make the strategy profitable."}
        </p>
      </Panel>

      <Panel title="Net P&L with and without the limits" description="Cumulative, by day" className="lg:col-span-3">
        <CompareChart data={opt.curve} splitDay={opt.splitDay} />
        <div className="mt-3 flex gap-5 text-xs text-muted-foreground">
          <Legend className="bg-brand" label="With limits" />
          <Legend className="bg-muted-foreground" label="Actual" />
        </div>
      </Panel>

      <Panel title="Results by period" className="lg:col-span-3">
        <ResultsTable rows={[["Fit days", opt.train], ["Test days", opt.test], ["All days", opt.all]]} />
        <p className="mt-3 text-xs text-muted-foreground">
          The test assumes each trade is independent. Past results do not guarantee future results.
        </p>
      </Panel>
    </div>
  )
}

const FOCUS_LABEL = { hour: "Best hours", weekday: "Best weekdays", symbol: "Best symbol", duration: "Best holding time" } as const
const focusValue = (f: FocusItem) => (f.kind === "hour" ? f.keys.map(hourLabel) : f.keys).join(", ")

function FocusList({ items }: { items: FocusItem[] }) {
  if (!items.length)
    return <p className="text-sm text-muted-foreground">No hour, weekday, symbol or holding time made money on the fit days.</p>
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((f) => {
        const held = f.test.net > 0
        return (
          <div key={f.kind} className="rounded-lg border border-profit/30 bg-profit/5 p-4">
            <p className="text-sm text-muted-foreground">{FOCUS_LABEL[f.kind]}</p>
            <p className="mt-1 font-display text-xl font-extrabold text-profit">{focusValue(f)}</p>
            <dl className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Fit days</dt>
                <dd className="font-mono tabular-nums">{money(f.fit.net, true)} · {plural(f.fit.trades, "trade")}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Test days</dt>
                <dd className={cn("flex items-center gap-1 font-mono tabular-nums", f.test.trades ? pnlClass(f.test.net) : "text-muted-foreground")}>
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
          {value ? (
            <p className="mt-1 text-sm font-medium">{value}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No change</p>
          )}
        </li>
      ))}
    </ul>
  )
}

function Big({ label, value, tone, emphasis }: { label: string; value: string; tone: string; emphasis?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-4", emphasis ? "border-brand/50 bg-brand/10" : "bg-background/50")}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-extrabold", tone)}>
        {value}
      </p>
    </div>
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

function ResultsTable({ rows }: { rows: [string, Comparison][] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="px-0">Period</TableHead>
          <TableHead className="text-right">Trades</TableHead>
          <TableHead className="text-right">Win rate</TableHead>
          <TableHead className="text-right">Actual</TableHead>
          <TableHead className="text-right">With limits</TableHead>
          <TableHead className="pr-0 text-right">Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([label, { actual, withRules }]) => {
          const gain = withRules.net - actual.net
          return (
            <TableRow key={label}>
              <TableCell className="px-0 font-medium">{label}</TableCell>
              <TableCell className={num}>{actual.trades} → {withRules.trades}</TableCell>
              <TableCell className={num}>{pct(actual.winRate)} → {pct(withRules.winRate)}</TableCell>
              <TableCell className={cn(num, pnlClass(actual.net))}>{money(actual.net, true)}</TableCell>
              <TableCell className={cn(num, pnlClass(withRules.net))}>{money(withRules.net, true)}</TableCell>
              <TableCell className={cn(num, "pr-0", pnlClass(gain))}>{money(gain, true)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
