export type Side = "buy" | "sell"

export interface Trade {
  ticket: string
  open: Date
  close: Date
  side: Side
  lots: number
  symbol: string
  openPrice: number
  closePrice: number
  sl: number | null
  tp: number | null
  commission: number
  swap: number
  profit: number
  /** profit + commission + swap */
  net: number
  reason: string
  durationMin: number
}

/** A trade with its open time resolved in the selected timezone. */
export interface LocalTrade extends Trade {
  day: string // yyyy-mm-dd
  hour: number // 0-23
  weekday: number // 0 = Mon ... 6 = Sun
}

export interface Group {
  key: string
  trades: number
  wins: number
  net: number
  winRate: number
  avg: number
  grossWin: number
  grossLoss: number
}
