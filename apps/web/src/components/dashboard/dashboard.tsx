import * as React from "react"
import { Lock } from "lucide-react"
import { DailyCheckIn } from "@/components/journal/daily-check-in"
import { JournalProvider } from "@/components/journal/journal-provider"
import { Tabs as TabsPrimitive } from "radix-ui"
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs"
import { useAnalytics, useCashFlows, useMe } from "@/hooks/use-api"
import { useFilters } from "@/hooks/use-filters"
import { filterQuery } from "@/lib/api/client"
import type { Analytics, CashFlows, Filters, FullAnalytics } from "@/lib/api/types"
import { buildInsights, type Insight } from "@/lib/insights"
import { FilterBar } from "./filter-bar"
import { LockedPanel } from "./locked-panel"
import { ShareDialog } from "./share-dialog"
import { SummaryCard } from "./summary-card"
import { TradesTable } from "./trades-table"
import { Frequency } from "./views/frequency"
import { Funding } from "./views/funding"
import { Journal } from "./views/journal"
import { Notes } from "./views/notes"
import { Overview } from "./views/overview"
import { Plan } from "./views/plan"
import { Risk } from "./views/risk"
import { Timing } from "./views/timing"

// Phones: one row of pills that scrolls sideways and snaps, with no track. From sm: Apple-style segmented control,
// a grey track with a white pill on the picked tab. The pill follows the tap at once (data-picked); the tab's content
// follows a moment later (see Dashboard), so the tap never waits for the charts.
const tab =
  "inline-flex h-11 flex-none snap-start items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[picked=true]:bg-card data-[picked=true]:text-foreground data-[picked=true]:shadow-sm sm:h-8 sm:text-[13px] dark:data-[picked=true]:bg-popover [&_svg]:shrink-0"
const tabList =
  "-mx-4 h-auto w-auto max-w-none snap-x snap-mandatory scroll-px-4 justify-start gap-1 overflow-x-auto scrollbar-none rounded-none bg-transparent px-4 py-0 sm:mx-0 sm:w-fit sm:max-w-full sm:gap-0.5 sm:rounded-full sm:bg-muted sm:p-1"

/** What each paid tab holds, for the locked panel on the Free plan. */
const LOCKED = {
  plan: ["What made money: your best hours, weekdays, symbol and holding time", "Limits tested on your own trades, then checked on days they were not fitted to"],
  timing: ["Net P&L by hour of the day", "A weekday and hour grid", "Net P&L by weekday and by holding time"],
  frequency: ["Overtrading: trades taken each day against the trades your best holding time allows", "Net P&L if you stop after a set number of trades each day", "Results of your 1st, 2nd, 3rd trade of the day", "Busy days and quiet days"],
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
  const { data: flows } = useCashFlows(accountId, filters.tz)
  const [tabValue, setTab] = React.useState("overview")
  // The picked tab's content renders as a deferred, interruptible update: React builds it in small slices and the
  // browser keeps painting in between, instead of one long frame on a phone.
  const shownTab = React.useDeferredValue(tabValue)
  // A plain function, not a component, so the triggers keep their identity (and keyboard focus) across renders.
  const trigger = (value: string, children: React.ReactNode) => (
    <TabsPrimitive.Trigger key={value} value={value} data-picked={value === tabValue} className={tab}>{children}</TabsPrimitive.Trigger>
  )
  const loaded = !!a
  const tabs = React.useRef<HTMLDivElement>(null)
  // Keep the active pill in view when the row scrolls sideways.
  React.useEffect(() => {
    const list = tabs.current
    const el = list?.querySelector<HTMLElement>("[data-picked=true]")
    if (!list || !el || list.scrollWidth <= list.clientWidth) return
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    list.scrollTo({ left: el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2, behavior: smooth ? "smooth" : "auto" })
  }, [tabValue, loaded])
  const lock = a?.locked ? <Lock className="size-3 text-muted-foreground" aria-label="Paid plan" /> : null

  // An empty result has no symbol list, so keep the last one for the filter bar.
  const [symbols, setSymbols] = React.useState<string[]>([])
  if (a && a.symbols.join() !== symbols.join()) setSymbols(a.symbols)

  return (
    <JournalProvider accountId={accountId} tz={filters.tz}>
      <DailyCheckIn />
      <div className="space-y-4 sm:space-y-5">
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
            <SummaryCard a={a} tz={filters.tz} flows={flows?.rows} />
            <Tabs value={shownTab} onValueChange={setTab} className="gap-4 sm:gap-5">
              <TabsList ref={tabs} className={tabList}>
                {trigger("overview", "Overview")}
                {trigger("journal", "Journal")}
                {trigger("notes", <>
                  Notes
                  {insights.length > 0 && (
                    <span className="rounded-full bg-muted px-1.5 font-mono text-[11px] font-medium text-muted-foreground">{insights.length}</span>
                  )}
                </>)}
                {trigger("plan", <>Plan{lock}</>)}
                {trigger("timing", <>Timing{lock}</>)}
                {trigger("frequency", <>Frequency{lock}</>)}
                {trigger("risk", "Risk")}
                {trigger("trades", "Trades")}
                {trigger("funding", "Funding")}
              </TabsList>
              <Views a={a} full={full} insights={insights} accountId={accountId} filters={filters} flows={flows} />
            </Tabs>
          </>
        )}
      </div>
    </JournalProvider>
  )
}

type ViewsProps = {
  a: Analytics
  full: FullAnalytics | null
  insights: Insight[]
  accountId: string
  filters: Filters
  flows: CashFlows | undefined
}

/** The tab panels. Memoized: tapping a tab re-renders only the pills, not the charts of the tab being left. */
const Views = React.memo(function Views({ a, full, insights, accountId, filters, flows }: ViewsProps) {
  return (
    <>
      <TabsContent value="overview"><Overview a={a} accountId={accountId} filters={filters} /></TabsContent>
      <TabsContent value="journal"><Journal /></TabsContent>
      <TabsContent value="notes">
        <Notes insights={insights} locked={!full} />
      </TabsContent>
      <TabsContent value="plan">
        {full ? <Plan opt={full.optimization} /> : <LockedPanel title="Plan" items={LOCKED.plan} />}
      </TabsContent>
      <TabsContent value="timing">
        {full ? <Timing a={full} /> : <LockedPanel title="Timing" items={LOCKED.timing} />}
      </TabsContent>
      <TabsContent value="frequency">
        {full ? <Frequency a={full} accountId={accountId} filters={filters} /> : <LockedPanel title="Frequency" items={LOCKED.frequency} />}
      </TabsContent>
      <TabsContent value="risk"><Risk a={a} /></TabsContent>
      <TabsContent value="trades">
        <TradesTable key={filterQuery(filters)} accountId={accountId} filters={filters} />
      </TabsContent>
      <TabsContent value="funding"><Funding accountId={accountId} flows={flows} tz={filters.tz} /></TabsContent>
    </>
  )
})
