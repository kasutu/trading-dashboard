import type { ColumnMapping, Field } from "@/lib/api/types"
import { LOCAL_TZ } from "@/lib/format"

/** Every field the importer knows, in form order, with a plain label. */
export const FIELDS: { field: Field; label: string; hint?: string }[] = [
  { field: "openTime", label: "Open time" },
  { field: "closeTime", label: "Close time" },
  { field: "profit", label: "Profit" },
  { field: "symbol", label: "Symbol" },
  { field: "side", label: "Side (buy or sell)" },
  { field: "lots", label: "Lots" },
  { field: "ticket", label: "Ticket", hint: "Jurno uses it to skip trades you already imported." },
  { field: "openPrice", label: "Open price" },
  { field: "closePrice", label: "Close price" },
  { field: "stopLoss", label: "Stop loss" },
  { field: "takeProfit", label: "Take profit" },
  { field: "commission", label: "Commission" },
  { field: "swap", label: "Swap" },
  { field: "closeReason", label: "Close reason" },
]

export const fieldLabel = (f: Field) => FIELDS.find((x) => x.field === f)!.label

const norm = (h: string) => h.trim().toLowerCase()

/** The mapping with each column replaced by the file's own header text. Columns not in the file are dropped. */
export function fitMapping(m: ColumnMapping, headers: string[]): ColumnMapping {
  const columns: ColumnMapping["columns"] = {}
  for (const [field, col] of Object.entries(m.columns) as [Field, string][]) {
    const h = headers.find((x) => norm(x) === norm(col))
    if (h) columns[field] = h
  }
  return { columns, timestampsTz: m.timestampsTz }
}

/** True when the file has every column of the preset. */
export const matchesPreset = (preset: ColumnMapping, headers: string[]) =>
  Object.values(preset.columns).every((col) => headers.some((h) => norm(h) === norm(col!)))

/** Timezones offered for the file's timestamps. */
export const FILE_TIMEZONES = [
  ...new Set([
    "UTC",
    LOCAL_TZ,
    "Europe/London",
    "Europe/Berlin",
    "Europe/Athens",
    "Europe/Moscow",
    "Asia/Dubai",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Australia/Sydney",
    "America/New_York",
    "America/Chicago",
  ]),
]
