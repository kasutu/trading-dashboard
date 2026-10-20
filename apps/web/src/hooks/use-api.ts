import * as React from "react"
import { api, filterQuery } from "@/lib/api/client"
import type { Account, AnalyticsResponse, CashFlows, ColumnMapping, Filters, Import, Me, SavedMapping, TradePage } from "@/lib/api/types"

// Mounted queries listen here. invalidate() makes the ones whose path starts with a prefix fetch again.
const listeners = new Set<(prefix: string) => void>()
export const invalidate = (prefix = "/") => listeners.forEach((l) => l(prefix))

type State<T> = { key?: string; data?: T; error?: string }

/** GET a path and keep the result. A null path fetches nothing. Old data stays visible while new data loads. */
export function useApi<T>(path: string | null) {
  const [version, setVersion] = React.useState(0)
  const [state, setState] = React.useState<State<T>>({})
  const key = path ? `${path}#${version}` : undefined

  React.useEffect(() => {
    if (!path) return
    const listener = (prefix: string) => path.startsWith(prefix) && setVersion((v) => v + 1)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [path])

  React.useEffect(() => {
    if (!path) return
    let live = true
    api<T>(path).then(
      (data) => live && setState({ key, data }),
      (e: Error) => live && setState((s) => ({ key, data: s.data, error: e.message }))
    )
    return () => { live = false }
  }, [path, key])

  return {
    data: state.data,
    error: state.key === key ? state.error : undefined,
    loading: key !== undefined && state.key !== key,
    refetch: () => setVersion((v) => v + 1),
  }
}

export const useMe = () => useApi<Me>("/me")
export const useAccounts = () => useApi<Account[]>("/accounts")
export const usePresets = () => useApi<{ exness: ColumnMapping }>("/presets")
export const useMappings = () => useApi<SavedMapping[]>("/mappings")
export const useImports = (accountId: string | null) => useApi<Import[]>(accountId && `/accounts/${accountId}/imports`)
export const useAnalytics = (accountId: string, f: Filters) =>
  useApi<AnalyticsResponse>(`/accounts/${accountId}/analytics?${filterQuery(f)}`)
export const useTrades = (accountId: string, f: Filters, extra: Record<string, string | number>) =>
  useApi<TradePage>(`/accounts/${accountId}/trades?${filterQuery(f, extra)}`)
export const cashFlowsPath = (accountId: string) => `/accounts/${accountId}/cash-flows`
export const useCashFlows = (accountId: string, tz: string) =>
  useApi<CashFlows>(`${cashFlowsPath(accountId)}?${new URLSearchParams({ tz })}`)
