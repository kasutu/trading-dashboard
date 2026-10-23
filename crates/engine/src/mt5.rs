//! MetaTrader 5 "Trade History Report" (the HTML report from the History tab).
//!
//! The report is a table of `<tr>` rows. A row with one wide cell starts a section
//! (`Positions`, `Orders`, `Deals`, `Results`); the row after it is the column header.
//! Before the first section are label rows (`Name:`, `Account:`, `Company:`, `Date:`).
//!
//! - One [`Trade`] per row of `Positions` (a partly closed position is one row with
//!   totals). The close reason comes from the deal(s) that closed it, matched on symbol and
//!   close time (and close price when several deals share that time); the last deal's comment
//!   decides: `[sl` → "sl", `[tp` → "tp", `[so` → "so" (margin stop out), anything else "user".
//! - One [`Mt5CashFlow`] per `balance` deal (see [`classify_balance`]). Other non-trade deals
//!   (`credit`, `bonus`, `correction`, `charge`, ...) are counted in `skipped` by type.
//! - Column headers are matched by their English names (the terminal's language must be
//!   English).

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

use crate::parse::parse_time;
use crate::stats::round2;
use crate::{FlowKind, Side, Trade};

/// The account the report belongs to, from the `Account:` line
/// (`50001234 (USD, Example-MT5Live2, real, Hedge)`) and the lines around it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mt5Account {
    /// The MetaTrader login (account number).
    pub login: String,
    pub name: Option<String>,
    pub currency: Option<String>,
    pub server: Option<String>,
    /// "real", "demo" or "contest", as the report says.
    pub kind: Option<String>,
    pub company: Option<String>,
}

/// A deposit, withdrawal or broker adjustment from a `balance` deal.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mt5CashFlow {
    /// The deal ticket. Stable across reports, so it identifies the flow on re-import.
    pub deal: String,
    pub time: DateTime<Utc>,
    pub kind: FlowKind,
    /// Always positive.
    pub amount: f64,
    /// The deal's comment as the broker wrote it (`D-…`, `W-…`, `D-NULL`).
    pub comment: String,
    /// The note to store: the comment, with a plain-language prefix for adjustments.
    pub note: String,
    /// An internal transfer (see [`is_internal`]).
    pub internal: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mt5Report {
    pub account: Mt5Account,
    /// One per position, sorted by open time.
    pub trades: Vec<Trade>,
    /// Position ticket → the position's comment (the report's hidden column), when not empty.
    pub comments: BTreeMap<String, String>,
    /// Sorted by time.
    pub cash_flows: Vec<Mt5CashFlow>,
    /// Deals that are not imported, counted by type (`credit`, `bonus`, ...).
    pub skipped: BTreeMap<String, u32>,
    /// Position rows that could not be read (no valid times).
    pub skipped_rows: u32,
    /// `Total Net Profit` from the Results section, when present.
    pub total_net: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Mt5Error {
    /// No `Positions` or `Deals` section: not an MT5 trade history report.
    NotAReport,
    /// The `Account:` line is missing or has no login.
    NoAccount,
    /// The server timezone is not a valid IANA name.
    BadTimezone(String),
}

/// Text of a report file: UTF-16 (with a BOM, or without one when the zero bytes show it)
/// or UTF-8. A leading BOM is removed.
pub fn decode(bytes: &[u8]) -> String {
    let utf16 = |be: bool, b: &[u8]| {
        let units: Vec<u16> = b
            .chunks_exact(2)
            .map(|c| {
                if be {
                    u16::from_be_bytes([c[0], c[1]])
                } else {
                    u16::from_le_bytes([c[0], c[1]])
                }
            })
            .collect();
        String::from_utf16_lossy(&units)
    };
    let text = match bytes {
        [0xFF, 0xFE, rest @ ..] => utf16(false, rest),
        [0xFE, 0xFF, rest @ ..] => utf16(true, rest),
        [b0, 0, ..] if *b0 != 0 => utf16(false, bytes),
        _ => String::from_utf8_lossy(bytes).into_owned(),
    };
    text.trim_start_matches('\u{feff}').to_string()
}

/// True when the text looks like an MT5 trade history report.
pub fn is_report(text: &str) -> bool {
    let head: String = text.chars().take(20_000).collect();
    head.contains("Trade History Report")
        || (text.contains(">Positions<") && text.contains(">Deals<"))
}

pub fn parse(text: &str, tz: &str) -> Result<Mt5Report, Mt5Error> {
    let tz: Tz = tz.parse().map_err(|_| Mt5Error::BadTimezone(tz.into()))?;
    let text = text.trim_start_matches('\u{feff}');

    let mut labels: BTreeMap<String, String> = BTreeMap::new();
    let mut positions: Option<Table> = None;
    let mut deals: Option<Table> = None;
    let mut section = String::new();
    let mut want_header = false;
    for row in rows(text) {
        let filled: Vec<&Cell> = row.iter().filter(|c| !c.text.is_empty()).collect();
        if row.len() == 1 && filled.len() == 1 && !filled[0].text.ends_with(':') {
            section = filled[0].text.to_lowercase();
            want_header = matches!(section.as_str(), "positions" | "deals");
            continue;
        }
        let table = match section.as_str() {
            "positions" => Some(&mut positions),
            "deals" => Some(&mut deals),
            _ => None,
        };
        match table {
            Some(t) if want_header => {
                *t = Some(Table::new(&row));
                want_header = false;
            }
            Some(Some(t)) => {
                if row.first().is_some_and(|c| starts_with_date(&c.text)) {
                    t.rows.push(row);
                }
            }
            Some(None) => {}
            None if section == "orders" => {}
            None => {
                // `Label:` cells followed by their value. The first one wins.
                for pair in row.windows(2) {
                    if let Some(label) = pair[0].text.strip_suffix(':') {
                        labels
                            .entry(label.trim().to_lowercase())
                            .or_insert_with(|| pair[1].text.clone());
                    }
                }
            }
        }
    }
    if positions.is_none() && deals.is_none() {
        return Err(Mt5Error::NotAReport);
    }
    let account = account(&labels).ok_or(Mt5Error::NoAccount)?;
    let total_net = labels.get("total net profit").and_then(|v| num(v));

    // Closing deals, by (symbol, time): (price, comment), in report order.
    let mut closes: BTreeMap<(String, DateTime<Utc>), Vec<Close>> = BTreeMap::new();
    let mut cash_flows = Vec::new();
    let mut skipped: BTreeMap<String, u32> = BTreeMap::new();
    if let Some(t) = &deals {
        for r in &t.rows {
            let get = |name: &str| t.get(r, name, 0);
            let kind = get("type").to_lowercase();
            let Some(time) = parse_time(get("time"), tz) else {
                continue;
            };
            match kind.as_str() {
                "buy" | "sell" => {
                    if get("direction").to_lowercase().contains("out") {
                        closes
                            .entry((get("symbol").to_string(), time))
                            .or_default()
                            .push((num(get("price")), get("comment").to_string()));
                    }
                }
                "balance" => match num(get("profit")).filter(|a| *a != 0.0) {
                    Some(amount) => {
                        let comment = get("comment").to_string();
                        let (kind, note) = classify_balance(amount, &comment);
                        let internal = kind != FlowKind::Adjustment && is_internal(&comment);
                        cash_flows.push(Mt5CashFlow {
                            deal: get("deal").to_string(),
                            time,
                            kind,
                            amount: round2(amount.abs()),
                            comment,
                            note,
                            internal,
                        });
                    }
                    None => *skipped.entry("balance".into()).or_default() += 1,
                },
                "" => {}
                other => *skipped.entry(other.to_string()).or_default() += 1,
            }
        }
    }
    cash_flows.sort_by_key(|f| f.time);

    let mut trades = Vec::new();
    let mut comments = BTreeMap::new();
    let mut skipped_rows = 0;
    if let Some(t) = &positions {
        for r in &t.rows {
            let get = |name: &str, nth: usize| t.get(r, name, nth);
            let (Some(open), Some(close)) = (
                parse_time(get("time", 0), tz),
                parse_time(get("time", 1), tz),
            ) else {
                skipped_rows += 1;
                continue;
            };
            let symbol = get("symbol", 0).to_string();
            let close_price = num(get("price", 1)).unwrap_or(0.0);
            let reason = closes
                .get(&(symbol.clone(), close))
                .map(|deals| close_reason(deals, close_price))
                .unwrap_or("user");
            let profit = num(get("profit", 0)).unwrap_or(0.0);
            let commission = num(get("commission", 0)).unwrap_or(0.0);
            let swap = num(get("swap", 0)).unwrap_or(0.0);
            let ticket = get("position", 0).to_string();
            let comment = t.comment(r);
            if !comment.is_empty() {
                comments.insert(ticket.clone(), comment);
            }
            trades.push(Trade {
                ticket,
                open,
                close,
                side: if get("type", 0).eq_ignore_ascii_case("sell") {
                    Side::Sell
                } else {
                    Side::Buy
                },
                lots: num(get("volume", 0)).unwrap_or(0.0),
                symbol,
                open_price: num(get("price", 0)).unwrap_or(0.0),
                close_price,
                sl: num(get("s / l", 0)),
                tp: num(get("t / p", 0)),
                commission,
                swap,
                profit,
                net: round2(profit + commission + swap),
                reason: reason.into(),
            });
        }
    }
    trades.sort_by_key(|t| t.open);

    Ok(Mt5Report {
        account,
        trades,
        comments,
        cash_flows,
        skipped,
        skipped_rows,
        total_net,
    })
}

/// The kind and note of a `balance` deal.
///
/// - A comment without a transfer reference (empty, or `D-NULL`): a broker adjustment when
///   money came in. Exness writes `D-NULL` when it resets a negative balance to zero after a
///   stop out (negative balance protection).
/// - `W-<ref>`, or any other money going out: a withdrawal.
/// - `D-<ref>`, or any other money coming in: a deposit.
pub fn classify_balance(amount: f64, comment: &str) -> (FlowKind, String) {
    let c = comment.trim();
    let no_ref = c.is_empty() || c.to_ascii_uppercase().ends_with("-NULL");
    if amount < 0.0 {
        return (FlowKind::Withdrawal, c.to_string());
    }
    if no_ref {
        let note = if c.eq_ignore_ascii_case("D-NULL") {
            format!("Negative balance reset (broker) · {c}")
        } else if c.is_empty() {
            "Balance adjustment (broker)".to_string()
        } else {
            format!("Balance adjustment (broker) · {c}")
        };
        return (FlowKind::Adjustment, note);
    }
    (FlowKind::Deposit, c.to_string())
}

/// Whether a `balance` deal's comment marks an internal transfer: a move between the trader's
/// own wallet or accounts at the broker. Exness comments are `<D|W>-<method>-<currency>-<ref>`,
/// with an `INT` part for internal moves (`W-ALLINT-USD-INT-…`); `CC` (credit card) and local
/// payment methods are money from or to outside the broker.
pub fn is_internal(comment: &str) -> bool {
    let mut parts = comment.trim().split('-');
    matches!(parts.next(), Some(p) if p.eq_ignore_ascii_case("D") || p.eq_ignore_ascii_case("W"))
        && parts.any(|p| p.eq_ignore_ascii_case("INT"))
}

/// A closing deal: its price and comment.
type Close = (Option<f64>, String);

/// The reason of the deal that closed a position. With several deals at the close time,
/// the ones at the position's close price win; the last one decides.
fn close_reason(deals: &[Close], close_price: f64) -> &'static str {
    let at_price: Vec<_> = deals
        .iter()
        .filter(|(p, _)| p.is_some_and(|p| (p - close_price).abs() < 1e-9))
        .collect();
    let last = match at_price.last() {
        Some(d) => &d.1,
        None => match deals.last() {
            Some(d) => &d.1,
            None => return "user",
        },
    };
    let c = last.trim_start().to_ascii_lowercase();
    if c.starts_with("[sl") {
        "sl"
    } else if c.starts_with("[tp") {
        "tp"
    } else if c.starts_with("[so") {
        "so"
    } else {
        "user"
    }
}

fn account(labels: &BTreeMap<String, String>) -> Option<Mt5Account> {
    let line = labels.get("account")?;
    let (login, rest) = match line.split_once('(') {
        Some((l, r)) => (l.trim(), r.trim_end_matches(')')),
        None => (line.trim(), ""),
    };
    if login.is_empty() {
        return None;
    }
    let parts: Vec<&str> = rest
        .split(',')
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect();
    let part = |i: usize| parts.get(i).map(|s| s.to_string());
    let non_empty = |k: &str| labels.get(k).filter(|v| !v.is_empty()).cloned();
    Some(Mt5Account {
        login: login.to_string(),
        name: non_empty("name"),
        currency: part(0).filter(|c| c.len() == 3).map(|c| c.to_uppercase()),
        server: part(1),
        kind: part(2).map(|k| k.to_lowercase()),
        company: non_empty("company"),
    })
}

/// A number as the report writes it: `1 525.86` (space as thousands separator), `-3.58`.
/// None for an empty or non-numeric cell.
fn num(s: &str) -> Option<f64> {
    let s: String = s.chars().filter(|c| !c.is_whitespace()).collect();
    s.parse::<f64>().ok().filter(|n| n.is_finite())
}

fn starts_with_date(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() >= 10 && b[..4].iter().all(u8::is_ascii_digit) && matches!(b[4], b'.' | b'-')
}

// ---------------------------------------------------------------------------
// A small reader for the report's table rows
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct Cell {
    text: String,
    hidden: bool,
}

/// A section's column header and its data rows.
struct Table {
    header: Vec<Cell>,
    rows: Vec<Vec<Cell>>,
}

impl Table {
    fn new(header: &[Cell]) -> Self {
        Table {
            header: header.to_vec(),
            rows: Vec::new(),
        }
    }

    /// The cells of `row` lined up with the header. The Positions header leaves out the
    /// hidden comment column that its rows have, so when the counts differ, hidden cells are
    /// dropped from both.
    fn aligned<'a>(&'a self, row: &'a [Cell]) -> (Vec<&'a Cell>, Vec<&'a Cell>) {
        if row.len() == self.header.len() {
            (self.header.iter().collect(), row.iter().collect())
        } else {
            (
                self.header.iter().filter(|c| !c.hidden).collect(),
                row.iter().filter(|c| !c.hidden).collect(),
            )
        }
    }

    /// The value under the `nth` column named `name` (case-insensitive), or "".
    fn get<'a>(&'a self, row: &'a [Cell], name: &str, nth: usize) -> &'a str {
        let (header, cells) = self.aligned(row);
        header
            .iter()
            .enumerate()
            .filter(|(_, h)| h.text.eq_ignore_ascii_case(name))
            .nth(nth)
            .and_then(|(i, _)| cells.get(i))
            .map_or("", |c| c.text.as_str())
    }

    /// The text of the row's hidden cells that have no header (the position comment).
    fn comment(&self, row: &[Cell]) -> String {
        if row.len() == self.header.len() {
            return self.get(row, "comment", 0).to_string();
        }
        row.iter()
            .filter(|c| c.hidden)
            .map(|c| c.text.as_str())
            .collect::<Vec<_>>()
            .join(" ")
            .trim()
            .to_string()
    }
}

/// Every `<tr>` of the document as its `<td>`/`<th>` cells, text decoded and trimmed.
fn rows(html: &str) -> Vec<Vec<Cell>> {
    // ASCII lowercase keeps byte offsets, so positions found in `lower` index `html`.
    let lower = html.to_ascii_lowercase();
    let starts = tag_starts(&lower, "<tr");
    let mut out = Vec::with_capacity(starts.len());
    for (i, &start) in starts.iter().enumerate() {
        let next = starts.get(i + 1).copied().unwrap_or(lower.len());
        let end = lower[start..next].find("</tr").map_or(next, |e| start + e);
        out.push(cells(&html[start..end], &lower[start..end]));
    }
    out
}

fn cells(html: &str, lower: &str) -> Vec<Cell> {
    let mut starts: Vec<usize> = tag_starts(lower, "<td");
    starts.extend(tag_starts(lower, "<th"));
    starts.sort_unstable();
    let mut out = Vec::with_capacity(starts.len());
    for (i, &start) in starts.iter().enumerate() {
        let Some(open_end) = lower[start..].find('>').map(|e| start + e) else {
            break;
        };
        let attrs = &lower[start..open_end];
        let next = starts
            .get(i + 1)
            .copied()
            .unwrap_or(lower.len())
            .max(open_end);
        let body_end = ["</td", "</th"]
            .iter()
            .filter_map(|t| lower[open_end..next].find(t))
            .min()
            .map_or(next, |e| open_end + e);
        out.push(Cell {
            text: text_of(&html[open_end + 1..body_end]),
            hidden: attrs.contains("hidden"),
        });
    }
    out
}

/// Byte offsets of `<tag` followed by a space or `>` (so `<th` does not match `<thead`).
fn tag_starts(lower: &str, tag: &str) -> Vec<usize> {
    lower
        .match_indices(tag)
        .map(|(i, _)| i)
        .filter(|&i| {
            matches!(
                lower.as_bytes().get(i + tag.len()),
                Some(b' ' | b'>' | b'\t' | b'\r' | b'\n' | b'/')
            )
        })
        .collect()
}

/// Inner HTML as plain text: tags removed, entities decoded, whitespace (incl. U+00A0)
/// collapsed to single spaces.
fn text_of(inner: &str) -> String {
    let mut plain = String::with_capacity(inner.len());
    let mut in_tag = false;
    for ch in inner.chars() {
        match ch {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            c if !in_tag => plain.push(c),
            _ => {}
        }
    }
    let decoded = decode_entities(&plain);
    decoded
        .split(|c: char| c.is_whitespace() || c == '\u{a0}')
        .filter(|w| !w.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn decode_entities(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        rest = &rest[i..];
        let Some(semi) = rest[..rest.len().min(12)].find(';') else {
            out.push('&');
            rest = &rest[1..];
            continue;
        };
        let name = &rest[1..semi];
        let ch = match name {
            "nbsp" => Some('\u{a0}'),
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ => name.strip_prefix('#').and_then(|n| {
                let code = match n.strip_prefix(['x', 'X']) {
                    Some(hex) => u32::from_str_radix(hex, 16).ok(),
                    None => n.parse().ok(),
                };
                code.and_then(char::from_u32)
            }),
        };
        match ch {
            Some(c) => {
                out.push(c);
                rest = &rest[semi + 1..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../tests/fixtures/mt5-report.html");

    fn utf16le_with_bom(s: &str) -> Vec<u8> {
        let mut b = vec![0xFF, 0xFE];
        for u in s.encode_utf16() {
            b.extend_from_slice(&u.to_le_bytes());
        }
        b
    }

    fn utc(s: &str) -> DateTime<Utc> {
        s.parse().unwrap()
    }

    fn report() -> Mt5Report {
        parse(FIXTURE, "UTC").unwrap()
    }

    #[test]
    fn decodes_utf16_and_utf8() {
        let bytes = utf16le_with_bom(FIXTURE);
        let text = decode(&bytes);
        assert_eq!(text, FIXTURE);
        assert_eq!(parse(&text, "UTC").unwrap(), report());
        // Without a BOM, the zero bytes give UTF-16 LE away.
        assert_eq!(decode(&bytes[2..]), FIXTURE);
        // UTF-8, with and without a BOM.
        assert_eq!(decode(FIXTURE.as_bytes()), FIXTURE);
        let mut bom = vec![0xEF, 0xBB, 0xBF];
        bom.extend_from_slice(FIXTURE.as_bytes());
        assert_eq!(decode(&bom), FIXTURE);
        assert!(is_report(&text));
        assert!(!is_report("ticket,opening_time_utc\n1,2\n"));
    }

    #[test]
    fn account_line() {
        let a = report().account;
        assert_eq!(
            a,
            Mt5Account {
                login: "50001234".into(),
                name: Some("Jane Sample".into()),
                currency: Some("USD".into()),
                server: Some("Example-MT5Live2".into()),
                kind: Some("real".into()),
                company: Some("Example Markets Ltd".into()),
            }
        );
    }

    #[test]
    fn one_trade_per_position() {
        let r = report();
        assert_eq!(r.trades.len(), 10);
        assert_eq!(r.skipped_rows, 0);
        let t = &r.trades[0];
        assert_eq!(t.ticket, "1001");
        assert_eq!(t.open, utc("2026-03-02T09:00:00Z"));
        assert_eq!(t.close, utc("2026-03-02T09:30:00Z"));
        assert_eq!(
            (t.side, t.lots, t.symbol.as_str()),
            (Side::Buy, 0.01, "XAUUSD")
        );
        assert_eq!((t.open_price, t.close_price), (2900.0, 2895.0));
        assert_eq!((t.sl, t.tp), (Some(2895.0), Some(2910.0)));
        // Empty S / L is null.
        assert_eq!(r.trades[1].sl, None);
        assert_eq!(r.trades[1].side, Side::Sell);
        assert_eq!(r.trades[1].net, 22.86);
        // Results' Total Net Profit is the sum of the positions.
        let sum: f64 = r.trades.iter().map(|t| t.net).sum();
        assert_eq!(r.total_net, Some(1206.16));
        assert!((sum - 1206.16).abs() < 0.005, "{sum}");
    }

    #[test]
    fn partial_close_is_one_trade_with_totals() {
        let r = report();
        let t = r.trades.iter().find(|t| t.ticket == "1004").unwrap();
        assert_eq!(t.lots, 0.03);
        assert_eq!(t.close, utc("2026-03-03T10:00:00Z"));
        assert_eq!(t.close_price, 2918.333);
        assert_eq!(t.profit, 25.0);
        // The last closing deal was the take profit.
        assert_eq!(t.reason, "tp");
    }

    #[test]
    fn close_reasons() {
        let r = report();
        let reasons: Vec<(&str, &str)> = r
            .trades
            .iter()
            .map(|t| (t.ticket.as_str(), t.reason.as_str()))
            .collect();
        assert_eq!(
            reasons,
            [
                ("1001", "sl"),
                ("1002", "tp"),
                ("1003", "user"),
                ("1004", "tp"),
                ("1005", "user"),
                ("1006", "so"),
                ("1007", "sl"),
                ("1008", "user"),
                ("1009", "user"),
                ("1010", "sl"),
            ]
        );
    }

    #[test]
    fn thousands_spaces_and_comments() {
        let r = report();
        let t = r.trades.iter().find(|t| t.ticket == "1005").unwrap();
        assert_eq!(t.profit, 1250.0);
        assert_eq!(t.net, 1241.5);
        assert_eq!(
            r.comments,
            BTreeMap::from([("1003".to_string(), "range breakout".to_string())])
        );
        assert_eq!(num("1 525.86"), Some(1525.86));
        assert_eq!(num("-1\u{a0}846.56"), Some(-1846.56));
        assert_eq!(num(""), None);
    }

    #[test]
    fn balance_deals_become_cash_flows() {
        let r = report();
        let flows: Vec<(&str, FlowKind, f64)> = r
            .cash_flows
            .iter()
            .map(|f| (f.deal.as_str(), f.kind, f.amount))
            .collect();
        assert_eq!(
            flows,
            [
                ("5001", FlowKind::Deposit, 500.0),
                ("5016", FlowKind::Adjustment, 3.4),
                ("5017", FlowKind::Deposit, 1000.0),
                ("5018", FlowKind::Withdrawal, 200.0),
            ]
        );
        assert_eq!(r.cash_flows[0].note, "D-EXAMPLE-USD-1000000000001");
        assert_eq!(
            r.cash_flows[1].note,
            "Negative balance reset (broker) · D-NULL"
        );
        assert_eq!(r.cash_flows[1].comment, "D-NULL");
        assert_eq!(r.cash_flows[1].time, utc("2026-03-05T03:10:05Z"));
        // The credit deal is not imported, only counted.
        assert_eq!(r.skipped, BTreeMap::from([("credit".to_string(), 1)]));
    }

    #[test]
    fn internal_transfers() {
        assert!(is_internal("W-ALLINT-USD-INT-1234"));
        assert!(is_internal("D-ALLINT-USD-INT-1234"));
        assert!(!is_internal("D-CC-USD-1234"));
        assert!(!is_internal("W-PHPAYMAY-USD-1234"));
        assert!(
            !is_internal("D-ALLINT-USD-1234"),
            "only a whole INT part counts"
        );
        assert!(!is_internal("D-NULL"));
        assert!(!is_internal("INT"));
        let r = report();
        let internal: Vec<bool> = r.cash_flows.iter().map(|f| f.internal).collect();
        assert_eq!(internal, [false, false, false, true]);
    }

    #[test]
    fn balance_rule() {
        use FlowKind::*;
        assert_eq!(classify_balance(10.0, "D-ABC-1").0, Deposit);
        assert_eq!(classify_balance(10.0, "Deposit").0, Deposit);
        assert_eq!(classify_balance(-10.0, "W-ABC-1").0, Withdrawal);
        assert_eq!(classify_balance(-10.0, "").0, Withdrawal);
        assert_eq!(classify_balance(0.5, "D-NULL").0, Adjustment);
        assert_eq!(
            classify_balance(0.5, ""),
            (Adjustment, "Balance adjustment (broker)".into())
        );
    }

    #[test]
    fn times_are_read_in_the_server_timezone() {
        let r = parse(FIXTURE, "Europe/Athens").unwrap();
        // March 2026 in Athens is UTC+2.
        assert_eq!(r.trades[0].open, utc("2026-03-02T07:00:00Z"));
        assert_eq!(r.cash_flows[0].time, utc("2026-03-01T06:00:00Z"));
        // Reasons still match: deals and positions shift together.
        assert_eq!(r.trades[3].reason, "tp");
        assert_eq!(
            parse(FIXTURE, "Mars/Base"),
            Err(Mt5Error::BadTimezone("Mars/Base".into()))
        );
    }

    #[test]
    fn errors() {
        assert_eq!(parse("a,b\n1,2\n", "UTC"), Err(Mt5Error::NotAReport));
        let no_account = FIXTURE.replace("Account:", "Konto:");
        assert_eq!(parse(&no_account, "UTC"), Err(Mt5Error::NoAccount));
    }

    #[test]
    fn html_text() {
        assert_eq!(text_of("<b>268&nbsp;(USD,&nbsp;X)</b>"), "268 (USD, X)");
        assert_eq!(
            text_of(" a &amp; b &#65;&#x42; &bogus; "),
            "a & b AB &bogus;"
        );
        let rows = rows("<TR><TD class=\"hidden\">x</TD><th>y<td>z</tr><tr><thead>");
        assert_eq!(rows.len(), 2);
        let t: Vec<_> = rows[0]
            .iter()
            .map(|c| (c.text.as_str(), c.hidden))
            .collect();
        assert_eq!(t, [("x", true), ("y", false), ("z", false)]);
        assert!(rows[1].is_empty());
    }
}
