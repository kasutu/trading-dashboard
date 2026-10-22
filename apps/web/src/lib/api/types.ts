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

/** The holding time that made the most. `key` is a byDuration key ("5–15m"). */
export type BestDuration = { key: string; medianMin: number; trades: number; net: number }
/** One trading day. `spanMin`: minutes with a trade open. `allowed`: trades of the best holding time that fit, null without one. */
export type OvertradeDay = { day: string; trades: number; spanMin: number; allowed: number | null; over: boolean; net: number }
/** `over` and `within` group the day nets; their `trades` counts days. */
export type Overtrading = { best: BestDuration | null; days: OvertradeDay[]; over: Group; within: Group }

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
  overtrading: Overtrading
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

// Journal. Source of truth: docs/journal-data.md.

/** 1 Awful, 2 Bad, 3 Okay, 4 Good, 5 Great. */
export type Mood = 1 | 2 | 3 | 4 | 5
export type Grade = "A" | "B" | "C"
export type MistakeGroup = "entry" | "exit" | "size" | "mindset"
/** What could get in the way today. A fixed list for now. */
export type DayRisk = "tired" | "news" | "distracted" | "chasing"

/** Setups and mistake tags belong to the person, not the trading account. */
export type Setup = { id: string; name: string; archived: boolean }
export type MistakeTag = { id: string; name: string; group: MistakeGroup; preset: boolean; archived: boolean }
/** GET /journal/tags. Archived ones are included. */
export type JournalTags = { setups: Setup[]; mistakes: MistakeTag[] }

/** Every answer is optional: null (or empty with the "None" flag false) means not answered. */
export type TradeReviewFields = {
  followedPlan: boolean | null
  setupId: string | null
  grade: Grade | null
  mood: Mood | null
  mistakeIds: string[]
  /** The trader tapped "None" for mistakes. */
  noMistakes: boolean
  initialStop: number | null
  note: string | null
}
/** PATCH body: fields left out are kept, null clears. */
export type TradeReviewInput = Partial<TradeReviewFields>
/** One per position, keyed by ticket, so every partial close shares it. */
export type TradeReview = TradeReviewFields & { ticket: string; updatedAt: string }

export type DayReviewFields = {
  preMood: Mood | null
  risks: DayRisk[]
  noRisks: boolean
  watchSetupIds: string[]
  followedPlan: boolean | null
  note: string | null
}
export type DayReviewInput = Partial<DayReviewFields>
/** One per trading day (yyyy-mm-dd in the dashboard timezone). */
export type DayReview = DayReviewFields & { day: string; updatedAt: string }

/** A position: every partial close of one ticket, summed. `day` is its opening day in `tz`. */
export type Position = {
  ticket: string
  day: string
  /** ISO time of the first fill. */
  open: string
  /** ISO time of the last close. */
  close: string
  symbol: string
  side: Side
  lots: number
  net: number
  openPrice: number
  /** Lot-weighted average close price. */
  closePrice: number
  /** The last stop loss in the CSV. */
  stopLoss: number | null
  /** The CSV stop looks moved (none, or at or past the entry), so ask for the starting stop. */
  askStop: boolean
  /** Result in R from the starting stop, else the CSV stop when not moved. */
  r: number | null
}
/** Net P&L and trade count of one day. Not affected by the dashboard filters. */
export type JournalDayStat = { day: string; trades: number; net: number }
/** GET /accounts/:id/journal?tz=. Positions newest first; `stats` has a row for every day with a review or a trade. */
export type Journal = { positions: Position[]; trades: TradeReview[]; days: DayReview[]; stats: JournalDayStat[] }

/** One group in the summary. `key`: a mood "1"-"5", setup id, grade, mistake id, or "yes"/"no" for the plan.
 *  For moods `trades` counts days. `avgR` is null when no trade in the group has an R. */
export type JournalRow = { key: string; trades: number; net: number; winRate: number; avgR: number | null }
/** GET /accounts/:id/journal/summary?tz=. Paid plans only. */
export type JournalSummary =
  | {
      minTrades: number
      minDays: number
      byMood: JournalRow[]
      bySetup: JournalRow[]
      byGrade: JournalRow[]
      byMistake: JournalRow[]
      byPlan: JournalRow[]
      locked?: undefined
    }
  | { locked: true }

export type Range = "7" | "30" | "90" | "all"
export type Filters = { range: Range; symbol: string; side: Side | "all"; tz: string }

/** Candle length. */
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d"
/** One OHLC bar. `time` is the bar's start, unix seconds UTC. */
export type Candle = { time: number; open: number; high: number; low: number; close: number }
/** GET /accounts/:id/candles (planned; the prototype generates them). Candles oldest first. */
export type Candles = { symbol: string; tf: Timeframe; candles: Candle[] }
