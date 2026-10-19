//! Jurno analytics engine.
//!
//! Pure functions, no I/O. The API parses uploads with [`parse_csv`] and builds the
//! dashboard payload with [`analyze`]. The payload mirrors the old TypeScript engine
//! (`apps/web/src/lib/trades`, see git history) field for field, in camelCase JSON.
//!
//! CONTRACT: the public types and function signatures in this file are shared with
//! `crates/api` and `apps/web/src/lib/api/types.ts`. Change them only together.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Column mapping (the "universal mapper")
// ---------------------------------------------------------------------------

/// A trade field that a CSV column can map to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Field {
    Ticket,
    OpenTime,
    CloseTime,
    Side,
    Lots,
    Symbol,
    OpenPrice,
    ClosePrice,
    StopLoss,
    TakeProfit,
    Commission,
    Swap,
    Profit,
    CloseReason,
}

impl Field {
    /// Fields without which a row cannot become a trade.
    pub const REQUIRED: [Field; 3] = [Field::OpenTime, Field::CloseTime, Field::Profit];
}

/// How the columns of one CSV file map to trade fields.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnMapping {
    /// Field -> CSV header text (matched case-insensitively, trimmed).
    pub columns: BTreeMap<Field, String>,
    /// IANA timezone of the timestamps in the file, e.g. "UTC" for Exness.
    pub timestamps_tz: String,
}

/// The mapping for an Exness trade history export.
pub fn exness_mapping() -> ColumnMapping {
    todo!("engine work")
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Buy,
    Sell,
}

/// One closed trade, normalized.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trade {
    /// Broker ticket. When the file has no ticket column, a stable hash of the row.
    pub ticket: String,
    pub open: DateTime<Utc>,
    pub close: DateTime<Utc>,
    pub side: Side,
    pub lots: f64,
    pub symbol: String,
    pub open_price: f64,
    pub close_price: f64,
    pub sl: Option<f64>,
    pub tp: Option<f64>,
    pub commission: f64,
    pub swap: f64,
    pub profit: f64,
    /// profit + commission + swap, rounded to cents.
    pub net: f64,
    /// Lowercase broker reason: "sl", "tp", "user", "so", or other text.
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseOutput {
    /// Sorted by open time.
    pub trades: Vec<Trade>,
    /// Rows that could not become a trade (missing or invalid required fields).
    pub skipped_rows: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ParseError {
    /// A required field has no column in the mapping.
    MissingMapping(Field),
    /// A mapped header is not in the file.
    MissingColumn(String),
    /// The timezone name is not a valid IANA name.
    BadTimezone(String),
    /// The file has a header row but no usable trades.
    NoTrades,
    /// The CSV itself cannot be read.
    Csv(String),
}

/// Parse a CSV file with a column mapping.
///
/// Accepted timestamps: `YYYY-MM-DD HH:MM:SS`, `YYYY-MM-DDTHH:MM:SS`, `YYYY.MM.DD HH:MM:SS`
/// (MT5), optional fractional seconds, optional `Z` or `±HH:MM` offset. A timestamp without
/// an offset is read in `mapping.timestamps_tz`.
/// Side: "buy"/"long" -> Buy, "sell"/"short" -> Sell (case-insensitive). Missing -> Buy.
pub fn parse_csv(text: &str, mapping: &ColumnMapping) -> Result<ParseOutput, ParseError> {
    let _ = (text, mapping);
    todo!("engine work")
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/// Dashboard filters. `range_days` counts back from the last close time.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Filters {
    pub range_days: Option<u32>,
    pub symbol: Option<String>,
    pub side: Option<Side>,
    /// IANA timezone used for days, hours and weekdays.
    pub tz: String,
}

/// Aggregate of a group of trades. Same as the old TS `Group`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub key: String,
    pub trades: u32,
    pub wins: u32,
    pub net: f64,
    pub win_rate: f64,
    pub avg: f64,
    pub gross_win: f64,
    pub gross_loss: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    #[serde(flatten)]
    pub group: Group,
    pub losses: u32,
    pub avg_win: f64,
    pub avg_loss: f64,
    pub payoff: f64,
    /// None means infinite (wins and no losses).
    pub profit_factor: Option<f64>,
    pub max_dd: f64,
    pub max_loss_streak: u32,
    pub days: u32,
    pub trades_per_day: f64,
    pub median_duration_min: f64,
    pub best_trade: f64,
    pub worst_trade: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EquityPoint {
    pub n: u32,
    /// Close time, epoch milliseconds.
    pub time: i64,
    pub equity: f64,
    pub drawdown: f64,
    pub net: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayBucket {
    pub key: String,
    pub days: u32,
    pub net: f64,
    pub avg_per_day: f64,
    pub green_days: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapRow {
    pub key: String,
    pub cap: u32,
    pub net: f64,
    pub trades: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LimitRow {
    /// "$20"
    pub key: String,
    pub limit: f64,
    pub net: f64,
    pub trades: u32,
    pub stopped_days: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AfterLoss {
    pub window_min: u32,
    pub after: Group,
    pub other: Group,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rules {
    pub skip_hours: Vec<u32>,
    /// 0 = Mon ... 6 = Sun
    pub skip_weekdays: Vec<u32>,
    pub cap: Option<u32>,
    pub loss_limit: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Merged {
    pub trades: u32,
    pub net: f64,
    pub win_rate: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FocusKind {
    Hour,
    Weekday,
    Symbol,
    Duration,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusItem {
    pub kind: FocusKind,
    pub keys: Vec<String>,
    pub fit: Merged,
    pub test: Merged,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comparison {
    pub actual: Group,
    pub with_rules: Group,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComparePoint {
    pub key: String,
    pub actual: f64,
    pub rules: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Optimization {
    pub focus: Vec<FocusItem>,
    pub rules: Rules,
    pub tested: u32,
    pub split_day: String,
    pub train_days: [String; 2],
    pub test_days: [String; 2],
    pub train: Comparison,
    pub test: Comparison,
    pub all: Comparison,
    pub curve: Vec<ComparePoint>,
}

/// Everything the dashboard shows, for one set of filters.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Analytics {
    /// First and last trading day (yyyy-mm-dd) in the filtered set.
    pub period: [String; 2],
    /// All symbols in the unfiltered trades, most traded first.
    pub symbols: Vec<String>,
    pub summary: Summary,
    pub curve: Vec<EquityPoint>,
    /// One group per day, key yyyy-mm-dd, sorted.
    pub daily: Vec<Group>,
    /// 24 groups, keys "0".."23".
    pub by_hour: Vec<Group>,
    /// Mon..Fri always, Sat/Sun only with trades. Keys "Mon".."Sun".
    pub by_weekday: Vec<Group>,
    /// 7 x 24: [weekday][hour].
    pub heatmap: Vec<Vec<Group>>,
    pub by_duration: Vec<Group>,
    /// Keys "SYMBOL · lots", e.g. "XAUUSD · 0.2", sorted by symbol then lots.
    pub by_lots: Vec<Group>,
    pub by_reason: Vec<Group>,
    pub by_symbol: Vec<Group>,
    pub by_side: Vec<Group>,
    pub nth_trade: Vec<Group>,
    pub day_buckets: Vec<DayBucket>,
    pub cap_sim: Vec<CapRow>,
    pub loss_limit_sim: Vec<LimitRow>,
    pub after_loss: AfterLoss,
    /// None with fewer than 10 days or 30 trades.
    pub optimization: Option<Optimization>,
}

/// Build the dashboard payload. None when no trades match the filters.
pub fn analyze(trades: &[Trade], filters: &Filters) -> Option<Analytics> {
    let _ = (trades, filters);
    todo!("engine work")
}

/// Trades that match the filters, localized, newest first. Used by the trades table
/// and the calendar. `from`/`to` are inclusive yyyy-mm-dd days in `filters.tz`.
pub fn filter_trades<'a>(
    trades: &'a [Trade],
    filters: &Filters,
    from: Option<&str>,
    to: Option<&str>,
) -> Vec<LocalTrade<'a>> {
    let _ = (trades, filters, from, to);
    todo!("engine work")
}

/// A trade with its open time resolved in the filter timezone.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTrade<'a> {
    #[serde(flatten)]
    pub trade: &'a Trade,
    /// yyyy-mm-dd of the open time.
    pub day: String,
    pub hour: u32,
    /// 0 = Mon ... 6 = Sun
    pub weekday: u32,
    pub duration_min: f64,
}
