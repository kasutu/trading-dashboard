import * as React from "react"
import { parseTradesCsv, type Trade } from "@/lib/trades"
import { storage } from "@/lib/storage"

const KEY = "jurno:csv"

export type TradeFile = { name: string; trades: Trade[] }

function restore(): TradeFile | null {
  const saved = storage.get(KEY)
  if (!saved) return null
  try {
    const { name, text } = JSON.parse(saved)
    return { name, trades: parseTradesCsv(text) }
  } catch {
    return null
  }
}

/** The loaded trade history. The last file is kept in localStorage. */
export function useTradeFile() {
  const [file, setFile] = React.useState<TradeFile | null>(restore)
  const [error, setError] = React.useState<string | null>(null)

  const load = async (f: File) => {
    try {
      const text = await f.text()
      setFile({ name: f.name, trades: parseTradesCsv(text) })
      setError(null)
      storage.set(KEY, JSON.stringify({ name: f.name, text }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot read the file.")
    }
  }

  const clear = () => {
    setFile(null)
    setError(null)
    storage.set(KEY, null)
  }

  return { file, error, load, clear }
}
