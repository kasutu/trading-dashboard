// Mirror of the API contract. Source of truth: crates/engine/src/lib.rs and docs/architecture.md.
// Change them together.

export type Field =
  | "ticket"
  | "openTime"
  | "closeTime"
  | "side"
  | "lots"
  | "symbol"
  | "openPrice"
  | "closePrice"
  | "stopLoss"
  | "takeProfit"
  | "commission"
  | "swap"
  | "profit"
  | "closeReason"

export const REQUIRED_FIELDS: Field[] = ["openTime", "closeTime", "profit"]

export type ColumnMapping = {
  /** Field -> CSV header text */
  columns: Partial<Record<Field, string>>
  /** IANA timezone of the timestamps in the file */
  timestampsTz: string
}

export type Side = "buy" | "sell"

export type Trade = {
  ticket: string
  open: string // ISO 8601, UTC
  close: string
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
  net: number
  reason: string
}

export type LocalTrade = Trade & { day: string; hour: number; weekday: number; durationMin: number }

export type Group = {
  key: string
  trades: number
  wins: number
  net: number
  winRate: number
  avg: number
  grossWin: number
  grossLoss: number
}

export type Summary = Group & {
  losses: number
  avgWin: number
  avgLoss: number
  payoff: number
  /** null = infinite */
  profitFactor: number | null
  maxDd: number
  maxLossStreak: number
  days: number
  tradesPerDay: number
  medianDurationMin: number
  bestTrade: number
  worstTrade: number
}

export type EquityPoint = { n: number; time: number; equity: number; drawdown: number; net: number }
export type DayBucket = { key: string; days: number; net: number; avgPerDay: number; greenDays: number }
export type CapRow = { key: string; cap: number; net: number; trades: number }
export type LimitRow = { key: string; limit: number; net: number; trades: number; stoppedDays: number }
export type AfterLoss = { windowMin: number; after: Group; other: Group }
/** Best and worst lot size on one symbol. Group keys are lots ("0.02"). Sizes with fewer than 5 trades are left out. */
export type BestLots = { symbol: string; best: Group | null; worst: Group | null; sizes: number }

export type Rules = { skipHours: number[]; skipWeekdays: number[]; cap: number | null; lossLimit: number | null }
export type Merged = { trades: number; net: number; winRate: number }
export type FocusItem = { kind: "hour" | "weekday" | "symbol" | "duration"; keys: string[]; fit: Merged; test: Merged }
export type Comparison = { actual: Group; withRules: Group }
export type ComparePoint = { key: string; actual: number; rules: number }

export type Optimization = {
  focus: FocusItem[]
  rules: Rules
  tested: number
  splitDay: string
  trainDays: [string, string]
  testDays: [string, string]
  train: Comparison
  test: Comparison
  all: Comparison
  curve: ComparePoint[]
}

/** Analytics every plan gets. */
export type CoreAnalytics = {
  period: [string, string]
  symbols: string[]
  summary: Summary
  curve: EquityPoint[]
  daily: Group[]
  /** Key: the Monday of the week, yyyy-mm-dd. */
  byWeek: Group[]
  /** Key: yyyy-mm. */
  byMonth: Group[]
  byLots: Group[]
  bestLots: BestLots[]
  byReason: Group[]
  bySymbol: Group[]
  bySide: Group[]
}

/** Timing statistics, recommendations and simulations. Paid plans only. */
export type PaidAnalytics = {
  byHour: Group[]
  byWeekday: Group[]
  heatmap: Group[][]
  byDuration: Group[]
  nthTrade: Group[]
  dayBuckets: DayBucket[]
  capSim: CapRow[]
  lossLimitSim: LimitRow[]
  afterLoss: AfterLoss
  optimization: Optimization | null
}

export type FullAnalytics = CoreAnalytics & PaidAnalytics & { locked?: undefined }

/** On the Free plan the server leaves out the paid fields and sets `locked`. */
export type Analytics = FullAnalytics | (CoreAnalytics & { locked: true })

export type AnalyticsResponse = Analytics | { empty: true }

export type Me = { id: string; username: string; plan: "free" | "espresso" | "latte" | "owner" }
export type Account = { id: string; name: string; broker: string | null; currency: string; createdAt: string; trades: number }
export type Import = { id: string; fileName: string; added: number; duplicates: number; skipped: number; createdAt: string }
export type SavedMapping = { id: string; name: string; mapping: ColumnMapping; createdAt: string }
export type TradePage = { rows: LocalTrade[]; total: number }

export type FlowKind = "deposit" | "withdrawal"
/** A deposit or withdrawal, entered by hand. `amount` is always positive. */
export type CashFlow = { id: string; occurredAt: string; kind: FlowKind; amount: number; note: string | null; createdAt: string }
/** With `day` (yyyy-mm-dd of `occurredAt` in the requested timezone). */
export type LocalCashFlow = CashFlow & { day: string }
export type FlowTotal = { count: number; total: number }
export type CashSummary = { deposits: FlowTotal; withdrawals: FlowTotal; net: number }
/** One day with cash flows. `withdrawals` is positive; `cumulative` is the net deposited so far. */
export type CashDay = { day: string; deposits: number; withdrawals: number; net: number; cumulative: number }
/** GET /accounts/:id/cash-flows. Rows newest first, `daily` oldest first. */
export type CashFlows = { rows: LocalCashFlow[]; summary: CashSummary; daily: CashDay[] }

/** 1 Awful, 2 Bad, 3 Okay, 4 Good, 5 Great. */
export type Mood = 1 | 2 | 3 | 4 | 5
/** What PUT takes for a day or a trade. A null mood and an empty note delete the entry. */
export type JournalInput = { mood: Mood | null; note: string | null }
/** Mood and note for one trading day (yyyy-mm-dd in the dashboard timezone). */
export type DayEntry = JournalInput & { day: string; updatedAt: string }
/** Mood and note for one position. Keyed by ticket, so every partial close shares it. */
export type TradeEntry = JournalInput & { ticket: string; updatedAt: string }
/** The position a trade entry belongs to, summed over its partial closes. `day` is its opening day in `tz`. */
export type JournalPosition = { day: string; symbol: string; side: Side; lots: number; net: number }
/** Net P&L and trade count of one day. Not affected by the dashboard filters. */
export type JournalDayStat = { day: string; trades: number; net: number }
export type JournalTrade = TradeEntry & { position: JournalPosition | null }
/** GET /accounts/:id/journal?tz=. Newest first. `stats` covers every day in `days` and every position day in `trades`. */
export type Journal = { days: DayEntry[]; trades: JournalTrade[]; stats: JournalDayStat[] }
/** One mood in P&L by mood. Only trading days with that mood count. `winRate` is the share of green days. */
export type MoodRow = { mood: Mood; days: number; net: number; avgPerDay: number; winRate: number }
/** GET /accounts/:id/journal/summary?tz=. Every mood is listed; a mood needs `minDays` days to be shown. Paid plans only. */
export type JournalSummary = { byMood: MoodRow[]; minDays: number; locked?: undefined } | { locked: true }

export type Range = "7" | "30" | "90" | "all"
export type Filters = { range: Range; symbol: string; side: Side | "all"; tz: string }

/** Candle length. */
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d"
/** One OHLC bar. `time` is the bar's start, unix seconds UTC. */
export type Candle = { time: number; open: number; high: number; low: number; close: number }
/** GET /accounts/:id/candles (planned; the prototype generates them). Candles oldest first. */
export type Candles = { symbol: string; tf: Timeframe; candles: Candle[] }
