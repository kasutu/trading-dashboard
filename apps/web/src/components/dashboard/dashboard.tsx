import * as React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAnalytics } from "@/hooks/use-api"
import { useFilters } from "@/hooks/use-filters"
import { filterQuery } from "@/lib/api/client"
import type { Analytics } from "@/lib/api/types"
import { buildInsights } from "@/lib/insights"
import { FilterBar } from "./filter-bar"
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

/** The dashboard for one trading account. The server computes every number. */
export function Dashboard({ accountId }: { accountId: string }) {
  const { filters, set } = useFilters()
  const { data, error } = useAnalytics(accountId, filters)
  const a: Analytics | null = data && !("empty" in data) ? data : null
  const insights = React.useMemo(() => (a ? buildInsights(a) : []), [a])

  // An empty result has no symbol list, so keep the last one for the filter bar.
  const [symbols, setSymbols] = React.useState<string[]>([])
  if (a && a.symbols.join() !== symbols.join()) setSymbols(a.symbols)

  return (
    <div className="space-y-5">
      <FilterBar filters={filters} symbols={symbols} onChange={set}>
        {a && <ShareDialog a={a} filters={filters} />}
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
                {insights.length > 0 && (
                  <span className="rounded-full bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground">{insights.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger className={tab} value="plan">Plan</TabsTrigger>
              <TabsTrigger className={tab} value="timing">Timing</TabsTrigger>
              <TabsTrigger className={tab} value="frequency">Frequency</TabsTrigger>
              <TabsTrigger className={tab} value="risk">Risk</TabsTrigger>
              <TabsTrigger className={tab} value="trades">Trades</TabsTrigger>
            </TabsList>
            <TabsContent value="overview"><Overview a={a} accountId={accountId} filters={filters} /></TabsContent>
            <TabsContent value="notes"><Notes insights={insights} /></TabsContent>
            <TabsContent value="plan"><Plan opt={a.optimization} /></TabsContent>
            <TabsContent value="timing"><Timing a={a} /></TabsContent>
            <TabsContent value="frequency"><Frequency a={a} /></TabsContent>
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
