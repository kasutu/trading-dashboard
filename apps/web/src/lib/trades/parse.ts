import Papa from "papaparse"
import type { Trade } from "./types"
import { round2 } from "./group"

const num = (v: unknown) => {
  if (v === undefined || v === null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Exness exports UTC timestamps without a "Z"
const utc = (s: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z")

/** Parse an Exness / MT5 trade history CSV. Throws if no trades are found. */
export function parseTradesCsv(text: string): Trade[] {
  const { data } = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })
  const trades: Trade[] = []
  for (const r of data) {
    if (!r.opening_time_utc || !r.closing_time_utc) continue
    const open = utc(r.opening_time_utc)
    const close = utc(r.closing_time_utc)
    if (isNaN(+open) || isNaN(+close)) continue
    const profit = num(r.profit) ?? 0
    const commission = num(r.commission) ?? 0
    const swap = num(r.swap) ?? 0
    trades.push({
      ticket: r.ticket,
      open,
      close,
      side: r.type?.toLowerCase() === "sell" ? "sell" : "buy",
      lots: num(r.lots) ?? 0,
      symbol: r.symbol ?? "",
      openPrice: num(r.opening_price) ?? 0,
      closePrice: num(r.closing_price) ?? 0,
      sl: num(r.stop_loss),
      tp: num(r.take_profit),
      commission,
      swap,
      profit,
      net: round2(profit + commission + swap),
      reason: (r.close_reason ?? "").toLowerCase(),
      durationMin: (+close - +open) / 60000,
    })
  }
  if (!trades.length)
    throw new Error("No trades found. The file must have the columns opening_time_utc, closing_time_utc and profit.")
  return trades.sort((a, b) => +a.open - +b.open)
}
