import * as React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useFilters } from "@/hooks/use-filters"
import { buildInsights } from "@/lib/insights"
import { summary, type Trade } from "@/lib/trades"
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

export function Dashboard({ trades }: { trades: Trade[] }) {
  const { filters, set, symbols, visible } = useFilters(trades)
  const s = React.useMemo(() => summary(visible), [visible])
  const insights = React.useMemo(() => buildInsights(visible), [visible])

  return (
    <div className="space-y-5">
      <FilterBar filters={filters} symbols={symbols} onChange={set}>
        {visible.length > 0 && <ShareDialog ts={visible} s={s} filters={filters} />}
      </FilterBar>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card py-16 text-center">
          <p className="font-medium">No trades match these filters</p>
          <p className="mt-1 text-sm text-muted-foreground">Select a longer date range or a different symbol.</p>
        </div>
      ) : (
        <>
          <SummaryCard ts={visible} s={s} tz={filters.tz} />
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
            <TabsContent value="overview"><Overview ts={visible} /></TabsContent>
            <TabsContent value="notes"><Notes insights={insights} /></TabsContent>
            <TabsContent value="plan"><Plan ts={visible} /></TabsContent>
            <TabsContent value="timing"><Timing ts={visible} /></TabsContent>
            <TabsContent value="frequency"><Frequency ts={visible} /></TabsContent>
            <TabsContent value="risk"><Risk ts={visible} /></TabsContent>
            <TabsContent value="trades"><TradesTable ts={visible} tz={filters.tz} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
