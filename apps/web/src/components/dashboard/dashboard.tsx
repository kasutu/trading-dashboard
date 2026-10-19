import * as React from "react"
import { Lock } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAnalytics, useMe } from "@/hooks/use-api"
import { useFilters } from "@/hooks/use-filters"
import { filterQuery } from "@/lib/api/client"
import type { Analytics } from "@/lib/api/types"
import { buildInsights } from "@/lib/insights"
import { FilterBar } from "./filter-bar"
import { LockedPanel } from "./locked-panel"
import { ShareDialog } from "./share-dialog"
import { SummaryCard } from "./summary-card"
import { TradesTable } from "./trades-table"
import { Frequency } from "./views/frequency"
import { Notes } from "./views/notes"
import { Overview } from "./views/overview"
import { Plan } from "./views/plan"
import { Risk } from "./views/risk"
import { Timing } from "./views/timing"

const tab =
  "flex-none px-1 pb-3 data-[state=active]:font-semibold group-data-[orientation=horizontal]/tabs:after:bottom-0 group-data-[orientation=horizontal]/tabs:after:h-[3px] after:rounded-full after:bg-brand"

/** What each paid tab holds, for the locked panel on the Free plan. */
const LOCKED = {
  notes: ["Your best and worst hours, weekdays and days", "What helps and what hurts your results, with a chart for each"],
  plan: ["What made money: your best hours, weekdays, symbol and holding time", "Limits tested on your own trades, then checked on days they were not fitted to"],
  timing: ["Net P&L by hour of the day", "A weekday and hour grid", "Net P&L by weekday and by holding time"],
  frequency: ["Net P&L if you stop after a set number of trades each day", "Results of your 1st, 2nd, 3rd trade of the day", "Busy days and quiet days"],
}

/** The dashboard for one trading account. The server computes every number. */
export function Dashboard({ accountId }: { accountId: string }) {
  const { filters, set } = useFilters()
  const { data, error } = useAnalytics(accountId, filters)
  const a: Analytics | null = data && !("empty" in data) ? data : null
  // On the Free plan the paid fields are absent and `full` is null.
  const full = a && !a.locked ? a : null
  const insights = React.useMemo(() => (full ? buildInsights(full) : []), [full])
  const { data: me } = useMe()
  const lock = a?.locked ? <Lock className="size-3 text-muted-foreground" aria-label="Paid plan" /> : null

  // An empty result has no symbol list, so keep the last one for the filter bar.
  const [symbols, setSymbols] = React.useState<string[]>([])
  if (a && a.symbols.join() !== symbols.join()) setSymbols(a.symbols)

  return (
    <div className="space-y-5">
      <FilterBar filters={filters} symbols={symbols} onChange={set}>
        {a && <ShareDialog a={a} filters={filters} footer={me?.plan !== "latte" && me?.plan !== "owner"} />}
      </FilterBar>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!data ? (
        !error && <p className="py-16 text-center text-sm text-muted-foreground">Loading your trades…</p>
      ) : !a ? (
        <div className="rounded-xl border border-dashed bg-card py-16 text-center">
          <p className="font-medium">No trades match these filters</p>
          <p className="mt-1 text-sm text-muted-foreground">Select a longer date range or a different symbol.</p>
        </div>
      ) : (
        <>
          <SummaryCard a={a} tz={filters.tz} />
          <Tabs defaultValue="overview" className="gap-5">
            <TabsList variant="line" className="h-auto w-full justify-start gap-6 overflow-x-auto border-b p-0">
              <TabsTrigger className={tab} value="overview">Overview</TabsTrigger>
              <TabsTrigger className={tab} value="notes">
                Notes
                {lock}
                {insights.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground">{insights.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger className={tab} value="plan">Plan{lock}</TabsTrigger>
              <TabsTrigger className={tab} value="timing">Timing{lock}</TabsTrigger>
              <TabsTrigger className={tab} value="frequency">Frequency{lock}</TabsTrigger>
              <TabsTrigger className={tab} value="risk">Risk</TabsTrigger>
              <TabsTrigger className={tab} value="trades">Trades</TabsTrigger>
            </TabsList>
            <TabsContent value="overview"><Overview a={a} accountId={accountId} filters={filters} /></TabsContent>
            <TabsContent value="notes">
              {full ? <Notes insights={insights} /> : <LockedPanel title="Notes" items={LOCKED.notes} />}
            </TabsContent>
            <TabsContent value="plan">
              {full ? <Plan opt={full.optimization} /> : <LockedPanel title="Plan" items={LOCKED.plan} />}
            </TabsContent>
            <TabsContent value="timing">
              {full ? <Timing a={full} /> : <LockedPanel title="Timing" items={LOCKED.timing} />}
            </TabsContent>
            <TabsContent value="frequency">
              {full ? <Frequency a={full} /> : <LockedPanel title="Frequency" items={LOCKED.frequency} />}
            </TabsContent>
            <TabsContent value="risk"><Risk a={a} /></TabsContent>
            <TabsContent value="trades">
              <TradesTable key={filterQuery(filters)} accountId={accountId} filters={filters} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
