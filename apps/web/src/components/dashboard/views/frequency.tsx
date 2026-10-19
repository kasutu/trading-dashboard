import * as React from "react"
import { PnlBars } from "@/components/charts/pnl-bars"
import { Panel } from "@/components/dashboard/panel"
import { money, ordinal, plural, pnlClass } from "@/lib/format"
import { best, nthTradeOfDay, sumNet, tradeCapSim, tradesPerDayBuckets, type LocalTrade } from "@/lib/trades"

export function Frequency({ ts }: { ts: LocalTrade[] }) {
  const nth = React.useMemo(() => nthTradeOfDay(ts), [ts])
  const caps = React.useMemo(() => tradeCapSim(ts), [ts])
  const buckets = React.useMemo(() => tradesPerDayBuckets(ts), [ts])
  const top = best(caps)!
  const actual = sumNet(ts)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title="Daily trade cap"
        description={
          <>
            Net P&L if you stop after N trades each day. Best cap: {plural(top.cap, "trade")},{" "}
            <span className={pnlClass(top.net)}>{money(top.net, true)}</span>. Actual: {money(actual, true)}.
          </>
        }
        className="lg:col-span-2"
      >
        <PnlBars
          data={caps}
          highlight={(d) => d.cap === top.cap}
          title={(d) => `Stop after ${plural(d.cap, "trade")}`}
          rows={(d) => [
            ["Net P&L", money(d.net, true), pnlClass(d.net)],
            ["Change", money(d.net - actual, true), pnlClass(d.net - actual)],
            ["Trades kept", d.trades],
          ]}
          height={260}
        />
      </Panel>
      <Panel title="Result by trade number" description="1st, 2nd, 3rd trade of the day and later">
        <PnlBars data={nth} title={(d) => `${ordinal(parseInt(d.key))}${d.key.endsWith("+") ? " and later" : ""} trade of the day`} />
      </Panel>
      <Panel title="Busy days and quiet days" description="Average daily P&L by number of trades that day">
        <PnlBars
          data={buckets}
          valueKey="avgPerDay"
          title={(d) => `${d.key} trades a day`}
          rows={(d) => [
            ["Avg per day", money(d.avgPerDay, true), pnlClass(d.avgPerDay)],
            ["Total", money(d.net, true), pnlClass(d.net)],
            ["Days", d.days],
            ["Green days", `${d.greenDays} of ${d.days}`],
          ]}
        />
      </Panel>
    </div>
  )
}
