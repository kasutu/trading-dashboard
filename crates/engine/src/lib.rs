//! Jurno analytics engine.
//!
//! Pure functions, no I/O. The API parses uploads with [`parse_csv`] and builds the
//! dashboard payload with [`analyze`]. The payload mirrors the old TypeScript engine
//! (`apps/web/src/lib/trades`, see git history) field for field, in camelCase JSON.
//!
//! CONTRACT: the public types and function signatures in this file are shared with
//! `crates/api` and `apps/web/src/lib/api/types.ts`. Change them only together.

use std::collections::BTreeMap;

use chrono::{DateTime, Datelike, Timelike, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

mod cash;
pub mod journal;
pub mod mt5;
mod optimize;
mod overtrade;
mod parse;
mod stats;

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
    parse::exness_mapping()
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
    /// The header mapped to a required field is not in the file.
    /// (A missing optional column is ignored.)
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
    parse::parse_csv(text, mapping)
}

pub use mt5::{Mt5Account, Mt5CashFlow, Mt5Error, Mt5Report};

/// Parse a MetaTrader 5 trade history report (HTML, already decoded to text; see
/// [`mt5::decode`]). Times in the report are broker server time, read in `server_tz`
/// (an IANA name; Exness servers run on UTC). See [`mt5`] for the mapping.
pub fn parse_mt5_report(text: &str, server_tz: &str) -> Result<Mt5Report, Mt5Error> {
    mt5::parse(text, server_tz)
}

/// True when the text looks like an MT5 trade history report rather than a CSV file.
pub fn is_mt5_report(text: &str) -> bool {
    mt5::is_report(text)
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

/// The lot size that made the most and the one that lost the most on one symbol.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BestLots {
    pub symbol: String,
    /// Highest net among sizes with enough trades, key = lots ("0.02"). None unless net > 0.
    pub best: Option<Group>,
    /// Lowest net among sizes with enough trades. None unless net < 0.
    pub worst: Option<Group>,
    /// Lot sizes on this symbol with enough trades to compare.
    pub sizes: u32,
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

/// The holding time that made the most: the yardstick for how many trades fit in a day.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BestDuration {
    /// A `by_duration` key, e.g. "15–60m".
    pub key: String,
    /// Median holding time of the trades in this bucket, in minutes.
    pub median_min: f64,
    pub trades: u32,
    pub net: f64,
}

/// One trading day: trades taken against trades that fit at the best holding time.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OvertradeDay {
    /// yyyy-mm-dd
    pub day: String,
    pub trades: u32,
    /// Minutes with at least one trade open (overlaps count once).
    pub span_min: f64,
    /// `span_min / best.median_min`, rounded down, at least 1. None without a best duration.
    pub allowed: Option<u32>,
    /// More trades than allowed.
    pub over: bool,
    pub net: f64,
}

/// Overtrading: each day's trade count against the count the best holding time allows.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Overtrading {
    /// None when no holding time with enough trades made money.
    pub best: Option<BestDuration>,
    /// Sorted by day.
    pub days: Vec<OvertradeDay>,
    /// Day nets of the days over the limit. `trades` counts days.
    pub over: Group,
    /// Day nets of the other days. `trades` counts days.
    pub within: Group,
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
    /// One group per week (weeks start Monday), key = the Monday as yyyy-mm-dd, sorted.
    pub by_week: Vec<Group>,
    /// One group per month, key yyyy-mm, sorted.
    pub by_month: Vec<Group>,
    /// 24 groups, keys "0".."23".
    pub by_hour: Vec<Group>,
    /// Mon..Fri always, Sat/Sun only with trades. Keys "Mon".."Sun".
    pub by_weekday: Vec<Group>,
    /// 7 x 24: [weekday][hour].
    pub heatmap: Vec<Vec<Group>>,
    pub by_duration: Vec<Group>,
    /// Keys "SYMBOL · lots", e.g. "XAUUSD · 0.2", sorted by symbol then lots.
    pub by_lots: Vec<Group>,
    /// Best and worst lot size per symbol, most traded symbol first.
    pub best_lots: Vec<BestLots>,
    pub by_reason: Vec<Group>,
    pub by_symbol: Vec<Group>,
    pub by_side: Vec<Group>,
    pub nth_trade: Vec<Group>,
    pub day_buckets: Vec<DayBucket>,
    pub cap_sim: Vec<CapRow>,
    pub loss_limit_sim: Vec<LimitRow>,
    pub after_loss: AfterLoss,
    pub overtrading: Overtrading,
    /// None with fewer than 10 days or 30 trades.
    pub optimization: Option<Optimization>,
}

/// Build the dashboard payload. None when no trades match the filters.
pub fn analyze(trades: &[Trade], filters: &Filters) -> Option<Analytics> {
    use stats::*;
    let mut sorted: Vec<&Trade> = trades.iter().collect();
    sorted.sort_by_key(|t| t.open);
    let symbols = by_count(group_by(
        sorted.iter().map(|t| (t.symbol.clone(), t.net)),
        &[],
    ));

    let local = select(&sorted, filters);
    let ts: Vec<&LocalTrade> = local.iter().collect();
    if ts.is_empty() {
        return None;
    }
    let daily = daily(&ts);
    Some(Analytics {
        period: [daily[0].key.clone(), daily[daily.len() - 1].key.clone()],
        symbols: symbols.into_iter().map(|g| g.key).collect(),
        summary: summary(&ts),
        curve: equity_curve(&ts),
        by_week: by_week(&ts),
        by_month: by_month(&ts),
        daily,
        by_hour: by_hour(&ts),
        by_weekday: by_weekday(&ts),
        heatmap: heatmap(&ts),
        by_duration: by_duration(&ts),
        by_lots: by_lots(&ts),
        best_lots: best_lots(&ts),
        by_reason: by_reason(&ts),
        by_symbol: by_symbol(&ts),
        by_side: by_side(&ts),
        nth_trade: nth_trade(&ts),
        day_buckets: day_buckets(&ts),
        cap_sim: cap_sim(&ts),
        loss_limit_sim: loss_limit_sim(&ts),
        after_loss: after_loss(&ts),
        overtrading: overtrade::overtrading(&ts),
        optimization: optimize::optimize(&ts),
    })
}

/// The trades in `sorted` that match the filters, localized, order kept.
fn select<'a>(sorted: &[&'a Trade], filters: &Filters) -> Vec<LocalTrade<'a>> {
    // The API validates tz; fall back to UTC rather than fail.
    let tz: Tz = filters.tz.parse().unwrap_or(Tz::UTC);
    let from = filters.range_days.and_then(|days| {
        let last = sorted.iter().map(|t| t.close).max()?;
        Some(last - chrono::Duration::days(days.into()))
    });
    sorted
        .iter()
        .filter(|t| {
            from.is_none_or(|f| t.open >= f)
                && filters.symbol.as_ref().is_none_or(|s| t.symbol == *s)
                && filters.side.is_none_or(|s| t.side == s)
        })
        .map(|&t| {
            let open = t.open.with_timezone(&tz);
            LocalTrade {
                trade: t,
                day: open.format("%Y-%m-%d").to_string(),
                hour: open.hour(),
                weekday: open.weekday().num_days_from_monday(),
                duration_min: (t.close - t.open).num_milliseconds() as f64 / 60_000.0,
            }
        })
        .collect()
}

/// Trades that match the filters, localized, newest first. Used by the trades table
/// and the calendar. `from`/`to` are inclusive yyyy-mm-dd days in `filters.tz`.
pub fn filter_trades<'a>(
    trades: &'a [Trade],
    filters: &Filters,
    from: Option<&str>,
    to: Option<&str>,
) -> Vec<LocalTrade<'a>> {
    let mut sorted: Vec<&Trade> = trades.iter().collect();
    sorted.sort_by_key(|t| std::cmp::Reverse(t.open));
    select(&sorted, filters)
        .into_iter()
        .filter(|t| {
            from.is_none_or(|f| t.day.as_str() >= f) && to.is_none_or(|d| t.day.as_str() <= d)
        })
        .collect()
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

// ---------------------------------------------------------------------------
// Deposits and withdrawals
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FlowKind {
    Deposit,
    Withdrawal,
    /// Money the broker put in that the trader did not send, such as a negative balance
    /// reset after a stop out (Exness `D-NULL`). Not counted as a deposit.
    Adjustment,
}

/// Money moved into or out of the account, entered by the user or imported. Not a trade.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashFlow {
    pub time: DateTime<Utc>,
    pub kind: FlowKind,
    /// Always positive. `kind` gives the direction.
    pub amount: f64,
    /// A move between the trader's own wallet or accounts at the broker (a deposit or
    /// withdrawal of this account all the same).
    #[serde(default)]
    pub internal: bool,
}

/// Count and total of one kind of cash flow.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowTotal {
    pub count: u32,
    pub total: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashSummary {
    pub deposits: FlowTotal,
    pub withdrawals: FlowTotal,
    /// Broker adjustments. Kept apart: not part of `net`.
    pub adjustments: FlowTotal,
    /// The deposits that were internal transfers in (part of `deposits`).
    pub transfers_in: FlowTotal,
    /// The withdrawals that were internal transfers out (part of `withdrawals`).
    pub transfers_out: FlowTotal,
    /// Deposits minus withdrawals.
    pub net: f64,
}

/// The cash flows of one day.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashDay {
    /// yyyy-mm-dd in the requested timezone.
    pub day: String,
    pub deposits: f64,
    /// Positive: the total taken out that day.
    pub withdrawals: f64,
    /// Broker adjustments that day (not part of `net`).
    pub adjustments: f64,
    /// deposits - withdrawals
    pub net: f64,
    /// Net deposited up to and including this day.
    pub cumulative: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashReport {
    pub summary: CashSummary,
    /// One entry per day with a cash flow, oldest first.
    pub daily: Vec<CashDay>,
}

/// Totals and the per-day timeline of deposits, withdrawals and adjustments. Days are in `tz`
/// (an IANA name; an unknown name falls back to UTC).
pub fn cash_report(flows: &[CashFlow], tz: &str) -> CashReport {
    cash::report(flows, tz.parse().unwrap_or(Tz::UTC))
}

/// yyyy-mm-dd of a time in `tz` (an IANA name; an unknown name falls back to UTC).
pub fn local_day(time: DateTime<Utc>, tz: &str) -> String {
    let tz: Tz = tz.parse().unwrap_or(Tz::UTC);
    time.with_timezone(&tz).format("%Y-%m-%d").to_string()
}
