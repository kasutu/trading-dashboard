import { PnlBars } from "@/components/charts/pnl-bars"
import { BreakdownTable } from "@/components/dashboard/breakdown-table"
import { LockedPanel } from "@/components/dashboard/locked-panel"
import { Panel } from "@/components/dashboard/panel"
import type { Analytics, FullAnalytics, Group } from "@/lib/api/types"
import { money, pct, plural, pnlClass, sizeLabel } from "@/lib/format"
import { best, cn } from "@/lib/utils"

export function Risk({ a }: { a: Analytics }) {
  const { byLots: lots, byReason: reasons } = a

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="P&L by position size" description="Lots per trade, for each symbol">
        <PnlBars data={lots} vertical height={Math.max(180, lots.length * 30 + 40)} title={(d) => sizeLabel(d.key)} />
      </Panel>
      <Panel title="How trades closed" description="Stop loss, take profit, manual or margin stop-out">
        <PnlBars data={reasons} vertical height={180} />
        <BreakdownTable label="Closed by" rows={reasons} className="mt-3" />
      </Panel>
      {a.locked ? (
        <LockedPanel
          title="Loss limits and trades after a loss"
          items={["The daily loss limit that kept the most money", "How trades opened right after a loss did"]}
          className="lg:col-span-2"
        />
      ) : (
        <Simulations a={a} />
      )}
    </div>
  )
}

/** Paid part of the Risk tab. */
function Simulations({ a }: { a: FullAnalytics }) {
  const { lossLimitSim: limits, afterLoss: al } = a
  const top = best(limits)
  const actual = a.summary.net
  return (
    <>
      {top && (
        <Panel
          title="Daily loss limit"
          description={
            <>
              Net P&L if you stop for the day after a loss of $X. Best limit: −${top.limit},{" "}
              <span className={pnlClass(top.net)}>{money(top.net, true)}</span>. Actual: {money(actual, true)}.
            </>
          }
          className="lg:col-span-2"
        >
          <PnlBars
            data={limits}
            highlight={(d) => d.limit === top.limit}
            title={(d) => `Stop at −$${d.limit} a day`}
            rows={(d) => [
              ["Net P&L", money(d.net, true), pnlClass(d.net)],
              ["Change", money(d.net - actual, true), pnlClass(d.net - actual)],
              ["Days stopped early", d.stoppedDays],
              ["Trades kept", d.trades],
            ]}
            height={240}
          />
        </Panel>
      )}
      <Panel
        title="Trades after a loss"
        description={`Trades opened within ${al.windowMin} minutes after a losing trade closed`}
        className="lg:col-span-2"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <GroupStat label="Right after a loss" g={al.after} />
          <GroupStat label="All other trades" g={al.other} />
        </div>
      </Panel>
    </>
  )
}

function GroupStat({ label, g }: { label: string; g: Group }) {
  return (
    <div className="rounded-lg border bg-background/50 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-medium tabular-nums", pnlClass(g.net))}>{money(g.net, true)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {plural(g.trades, "trade")} · {pct(g.winRate)} win rate · {money(g.avg, true)} per trade
      </p>
    </div>
  )
}
