import * as React from "react"
import { useApi } from "@/hooks/use-api"
import { filterQuery } from "@/lib/api/client"
import type { Analytics, AnalyticsResponse, Filters } from "@/lib/api/types"

/** The account's analytics on all trades, whatever the filter bar says (the timezone still applies). For numbers that
 *  must not change with the filters: the Today card's plan and the account balance. Reuses the dashboard's data when
 *  its filters are already "all". */
export function useAllAnalytics(accountId: string, filters: Filters, data: AnalyticsResponse | undefined) {
  const all = filters.range === "all" && filters.symbol === "all" && filters.side === "all"
  const own = useApi<AnalyticsResponse>(all ? null : `/accounts/${accountId}/analytics?${filterQuery({ ...filters, range: "all", symbol: "all", side: "all" })}`)
  const res = all ? data : own.data
  // Keep the last result while a new one loads, so nothing blinks when the filters change.
  const [last, setLast] = React.useState<Analytics | null>(null)
  const a = res && !("empty" in res) ? res : null
  if (a && a !== last) setLast(a)
  return a ?? last
}
