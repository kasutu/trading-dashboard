import * as React from "react"
import type { Account } from "@/lib/api/types"
import { storage } from "@/lib/storage"

const KEY = "jurno:account"

/** The selected trading account. Falls back to the first account. The choice is kept in localStorage. */
export function useSelectedAccount(accounts: Account[] | undefined) {
  const [id, setId] = React.useState(() => storage.get(KEY))
  const account = accounts?.find((a) => a.id === id) ?? accounts?.[0] ?? null
  const select = (next: string) => {
    setId(next)
    storage.set(KEY, next)
  }
  return { account, select }
}
