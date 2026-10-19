import * as React from "react"
import type { Filters } from "@/lib/api/types"
import { LOCAL_TZ } from "@/lib/format"

// An array keeps the order. Object keys like "7" would sort before "all".
export const RANGES = [
  ["7", "7D"],
  ["30", "30D"],
  ["90", "90D"],
  ["all", "All"],
] as const

/** Dashboard filter state. The server applies the filters. */
export function useFilters() {
  const [filters, setFilters] = React.useState<Filters>({ range: "all", symbol: "all", side: "all", tz: LOCAL_TZ })
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  return { filters, set }
}
