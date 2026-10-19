import * as React from "react"
import { LOCAL_TZ, bySymbol, localize, type Side, type Trade } from "@/lib/trades"

// An array keeps the order. Object keys like "7" would sort before "all".
export const RANGES = [
  ["7", "7D"],
  ["30", "30D"],
  ["90", "90D"],
  ["all", "All"],
] as const
export type Range = (typeof RANGES)[number][0]

export type Filters = { range: Range; symbol: string; side: Side | "all"; tz: string }

const DAY_MS = 86400000

/** Filter state and the trades that match it, localized to the chosen timezone. */
export function useFilters(trades: Trade[]) {
  const [filters, setFilters] = React.useState<Filters>({ range: "all", symbol: "all", side: "all", tz: LOCAL_TZ })
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))

  const symbols = React.useMemo(() => bySymbol(trades).map((g) => g.key), [trades])
  const localized = React.useMemo(() => localize(trades, filters.tz), [trades, filters.tz])

  const visible = React.useMemo(() => {
    const { range, symbol, side } = filters
    const last = Math.max(...trades.map((t) => +t.close))
    const from = range === "all" ? -Infinity : last - Number(range) * DAY_MS
    return localized.filter(
      (t) => +t.open >= from && (symbol === "all" || t.symbol === symbol) && (side === "all" || t.side === side)
    )
  }, [localized, filters, trades])

  return { filters, set, symbols, visible }
}
