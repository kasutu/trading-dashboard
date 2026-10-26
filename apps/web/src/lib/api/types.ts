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

/** Settings that follow the user to every device. */
export type ServerSettings = { checkIn: boolean; minRr: number | null }
/** `exness`: account connection is on. `email`: the server can send email. */
export type Me = {
  id: string
  username: string
  plan: "free" | "espresso" | "latte" | "owner"
  settings: ServerSettings
  features: { exness: boolean; email: boolean }
}
/** `mtLogin`: the MetaTrader login, set by the first MT5 report import. */
/** Configuration of a trading account. `daily` and `perTrade` are a % of the balance or dollars, by `kind`. Null: no
 *  limit. `maxTrades` is no longer set (the Frequency best cap is used). `weekends`: trade on Saturdays and Sundays. */
export type AccountRisk = { kind: "percent" | "amount"; daily: number | null; perTrade: number | null; maxTrades: number | null; weekends?: boolean }
export type Account = { id: string; name: string; broker: string | null; currency: string; mtLogin: string | null; risk: AccountRisk | null; createdAt: string; trades: number }
export type Import = { id: string; fileName: string; added: number; duplicates: number; skipped: number; createdAt: string }
export type SavedMapping = { id: string; name: string; mapping: ColumnMapping; createdAt: string }
export type TradePage = { rows: LocalTrade[]; total: number }

/** "adjustment": money the broker put in that the trader did not send (a negative balance reset). Not a deposit. */
export type FlowKind = "deposit" | "withdrawal" | "adjustment"
/** A deposit, withdrawal or adjustment. `amount` is always positive. `sourceId`: the MT5 deal ticket when imported, null when entered by hand.
 *  `internal`: a move between the trader's own wallet or accounts at the broker (an `INT` deal), not money from or to outside. */
export type CashFlow = { id: string; occurredAt: string; kind: FlowKind; amount: number; note: string | null; sourceId: string | null; internal: boolean; createdAt: string }
/** With `day` (yyyy-mm-dd of `occurredAt` in the requested timezone). */
export type LocalCashFlow = CashFlow & { day: string }
export type FlowTotal = { count: number; total: number }
/** `net` = deposits - withdrawals; adjustments are kept apart. `transfersIn`/`transfersOut`: the internal part of deposits/withdrawals. */
export type CashSummary = { deposits: FlowTotal; withdrawals: FlowTotal; adjustments: FlowTotal; transfersIn: FlowTotal; transfersOut: FlowTotal; net: number }
/** One day with cash flows. `withdrawals` is positive; `cumulative` is the net deposited so far (adjustments left out). */
export type CashDay = { day: string; deposits: number; withdrawals: number; adjustments: number; net: number; cumulative: number }
/** GET /accounts/:id/cash-flows. Rows newest first, `daily` oldest first. */
export type CashFlows = { rows: LocalCashFlow[]; summary: CashSummary; daily: CashDay[] }

/** POST /accounts/:id/imports with `format: "mt5"`. `import` is null on a dry run. */
export type Mt5ImportResult = {
  dryRun: boolean
  import: Import | null
  account: { login: string; server: string | null; kind: string | null; currency: string | null; company: string | null }
  /** First and last time in the report (ISO, UTC); null when it is empty. */
  from: string | null
  to: string | null
  positions: number
  totalNet: number | null
  trades: { added: number; duplicates: number }
  cashFlows: {
    added: number
    duplicates: number
    /** Every balance operation in the report. */
    summary: CashSummary
    /** Hand-entered flows with the same kind and amount within a day of an imported one. */
    possibleManualDuplicates: Pick<CashFlow, "id" | "occurredAt" | "kind" | "amount" | "note">[]
  }
  /** Deals not imported, by type: { credit: 1 } */
  skippedDeals: Record<string, number>
  skippedRows: number
}

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
  /** The planned take profit, set on the trade chart. Null: the CSV take profit. */
  initialTarget: number | null
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

// ---------------------------------------------------------------------------
// Today card (engine::today)
// ---------------------------------------------------------------------------

export type Tone = "profit" | "loss" | null
export type TodayRule = { text: string; note: string | null; warn: string | null; tone: Tone }
export type TodayPlan = {
  day: string
  /** "Monday, October 26" */
  date: string
  weekday: number
  trades: number
  dayNet: number
  limits: { daily: number | null; from: "account" | "plan" | null; perTrade: number | null; trades: number | null }
  /** Trades left today. Null without a trade cap. */
  left: number | null
  rest: boolean
  stop: boolean
  verdict: { label: string; tone: Tone; why: string }
  rules: TodayRule[]
  questions: string[]
  bestWeekdays: string[]
  skipWeekdays: string[]
  hour: number
  bestHours: number[]
  skipHours: number[]
  locked: boolean
}
export type TodayResponse = TodayPlan | { empty: true }

// ---------------------------------------------------------------------------
// Reminder email
// ---------------------------------------------------------------------------

export type EmailFrequency = "weekdays" | "daily" | "weekly"
export type EmailSettings = {
  email: string | null
  verified: boolean
  enabled: boolean
  frequency: EmailFrequency
  /** "HH:MM" in `tz`. */
  time: string
  tz: string
  /** False: the server has no email provider, so emails only reach its log. */
  canSend: boolean
}

// ---------------------------------------------------------------------------
// Playbook (engine::playbook)
// ---------------------------------------------------------------------------

export type PlanSize = { by: "lots" | "risk" | "percent"; value: number }
export type SymbolValue = { symbol: string; point: number; valuePerPoint: number | null; trades: number; source: "trades" | "user" | null }
export type PlanMath = {
  lots: number | null
  slPoints: number
  tpPoints: number | null
  risk: number | null
  reward: number | null
  rr: number | null
  riskPercent: number | null
  errors: string[]
}
export type PlanCheck = { rule: "trades" | "lossLimit" | "perTrade" | "hour" | "rest" | "rr"; text: string }
export type PlanCalc = { math: PlanMath; value: SymbolValue; checks: PlanCheck[]; balance: number | null }
export type PlanStatus = "planned" | "taken" | "skipped"
export type PlanResult = {
  ticket: string
  open: string
  openPrice: number
  closePrice: number
  lots: number
  net: number
  slippagePoints: number
  slMoved: number | null
  tpMoved: number | null
  lotsChanged: boolean
  r: number | null
}
export type PlannedTrade = {
  id: string
  symbol: string
  side: Side
  entry: number
  stopLoss: number
  takeProfit: number | null
  lots: number
  setupId: string | null
  note: string | null
  status: PlanStatus
  ticket: string | null
  createdAt: string
  updatedAt: string
  math: PlanMath
  result: PlanResult | null
}
export type Playbook = { plans: PlannedTrade[]; symbols: SymbolValue[]; balance: number | null; minRr: number | null; locked: boolean }

// ---------------------------------------------------------------------------
// Exness connection
// ---------------------------------------------------------------------------

export type ExnessConnection = {
  enabled: boolean
  canConnect: boolean
  locked: boolean
  connected: boolean
  exnessAccountId: string | null
  host: string | null
  status: "ok" | "failing" | "paused" | null
  failures: number
  lastError: string | null
  lastSyncAt: string | null
  lastSyncTrades: number | null
  lastSyncFlows: number | null
  syncedUntil: string | null
  connectedAt: string | null
}
