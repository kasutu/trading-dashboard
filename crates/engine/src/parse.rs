//! CSV parsing with a column mapping.

use std::collections::BTreeMap;

use chrono::{DateTime, FixedOffset, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Tz;

use crate::stats::round2;
use crate::{ColumnMapping, Field, ParseError, ParseOutput, Side, Trade};

pub fn exness_mapping() -> ColumnMapping {
    use Field::*;
    let columns = [
        (Ticket, "ticket"),
        (OpenTime, "opening_time_utc"),
        (CloseTime, "closing_time_utc"),
        (Side, "type"),
        (Lots, "lots"),
        (Symbol, "symbol"),
        (OpenPrice, "opening_price"),
        (ClosePrice, "closing_price"),
        (StopLoss, "stop_loss"),
        (TakeProfit, "take_profit"),
        (Commission, "commission"),
        (Swap, "swap"),
        (Profit, "profit"),
        (CloseReason, "close_reason"),
    ]
    .into_iter()
    .map(|(f, h)| (f, h.to_string()))
    .collect();
    ColumnMapping { columns, timestamps_tz: "UTC".into() }
}

pub fn parse_csv(text: &str, mapping: &ColumnMapping) -> Result<ParseOutput, ParseError> {
    for f in Field::REQUIRED {
        if !mapping.columns.contains_key(&f) {
            return Err(ParseError::MissingMapping(f));
        }
    }
    let tz: Tz = mapping
        .timestamps_tz
        .parse()
        .map_err(|_| ParseError::BadTimezone(mapping.timestamps_tz.clone()))?;

    let csv_err = |e: csv::Error| ParseError::Csv(e.to_string());
    let mut rdr = csv::ReaderBuilder::new().flexible(true).from_reader(text.as_bytes());
    let headers: Vec<String> = rdr
        .headers()
        .map_err(csv_err)?
        .iter()
        .map(|h| h.trim_start_matches('\u{feff}').trim().to_lowercase())
        .collect();

    // A missing required column fails the import. A missing optional column is
    // treated as unmapped, so a preset still works on a shorter export.
    let mut idx = BTreeMap::new();
    for (f, name) in &mapping.columns {
        let want = name.trim().to_lowercase();
        match headers.iter().position(|h| *h == want) {
            Some(i) => {
                idx.insert(*f, i);
            }
            None if Field::REQUIRED.contains(f) => return Err(ParseError::MissingColumn(name.clone())),
            None => {}
        }
    }

    let mut trades = Vec::new();
    let mut skipped_rows = 0;
    for rec in rdr.records() {
        let rec = rec.map_err(csv_err)?;
        let get = |f: Field| idx.get(&f).and_then(|&i| rec.get(i)).map_or("", str::trim);
        match row(get, tz) {
            Some(t) => trades.push(t),
            None => skipped_rows += 1,
        }
    }
    if trades.is_empty() {
        return Err(ParseError::NoTrades);
    }
    trades.sort_by_key(|t| t.open);
    Ok(ParseOutput { trades, skipped_rows })
}

/// One CSV row as a trade, or None when a required value is missing or invalid.
fn row<'r>(get: impl Fn(Field) -> &'r str, tz: Tz) -> Option<Trade> {
    let open = parse_time(get(Field::OpenTime), tz)?;
    let close = parse_time(get(Field::CloseTime), tz)?;
    let profit = num(get(Field::Profit))?;
    let commission = num(get(Field::Commission)).unwrap_or(0.0);
    let swap = num(get(Field::Swap)).unwrap_or(0.0);
    let side = match get(Field::Side).to_lowercase().as_str() {
        "sell" | "short" => Side::Sell,
        _ => Side::Buy,
    };
    let ticket = match get(Field::Ticket) {
        "" => {
            let key = [Field::OpenTime, Field::CloseTime, Field::Symbol, Field::Lots, Field::Profit]
                .map(&get)
                .join("|");
            format!("{:016x}", fnv1a(key.as_bytes()))
        }
        t => t.to_string(),
    };
    Some(Trade {
        ticket,
        open,
        close,
        side,
        lots: num(get(Field::Lots)).unwrap_or(0.0),
        symbol: get(Field::Symbol).to_string(),
        open_price: num(get(Field::OpenPrice)).unwrap_or(0.0),
        close_price: num(get(Field::ClosePrice)).unwrap_or(0.0),
        sl: num(get(Field::StopLoss)),
        tp: num(get(Field::TakeProfit)),
        commission,
        swap,
        profit,
        net: round2(profit + commission + swap),
        reason: get(Field::CloseReason).to_lowercase(),
    })
}

/// A finite number, or None for empty or invalid text.
fn num(s: &str) -> Option<f64> {
    s.trim().parse::<f64>().ok().filter(|n| n.is_finite())
}

/// FNV-1a, 64 bit. Stable across runs and platforms.
fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |h, &b| (h ^ b as u64).wrapping_mul(0x0100_0000_01b3))
}

/// `YYYY-MM-DD HH:MM[:SS[.fff]]`, `T` or space separator, `.` allowed in the date (MT5),
/// optional `Z` or `±HH:MM` / `±HHMM`. Without an offset the time is read in `tz`.
pub(crate) fn parse_time(s: &str, tz: Tz) -> Option<DateTime<Utc>> {
    if s.len() < 16 || !s.is_char_boundary(10) {
        return None;
    }
    let (date, rest) = s.split_at(10);
    let rest = rest.strip_prefix([' ', 'T', 't'])?;
    let (time, offset) = split_offset(rest);
    let text = format!("{} {}", date.replace('.', "-"), time.trim());
    let ndt = NaiveDateTime::parse_from_str(&text, "%Y-%m-%d %H:%M:%S%.f")
        .or_else(|_| NaiveDateTime::parse_from_str(&text, "%Y-%m-%d %H:%M"))
        .ok()?;
    match offset {
        Some(secs) => FixedOffset::east_opt(secs)?.from_local_datetime(&ndt).single().map(|d| d.to_utc()),
        // ponytail: a time inside a DST gap does not exist and makes the row invalid;
        // an ambiguous time (DST end) takes the earlier instant.
        None => tz.from_local_datetime(&ndt).earliest().map(|d| d.to_utc()),
    }
}

/// Split a trailing `Z`, `±HH:MM` or `±HHMM` off a time. Returns the offset in seconds.
fn split_offset(t: &str) -> (&str, Option<i32>) {
    if let Some(x) = t.strip_suffix(['Z', 'z']) {
        return (x, Some(0));
    }
    if let Some(p) = t.rfind(['+', '-']) {
        let digits = t[p + 1..].replace(':', "");
        if digits.len() == 4 && digits.bytes().all(|b| b.is_ascii_digit()) {
            let h: i32 = digits[..2].parse().unwrap_or(0);
            let m: i32 = digits[2..].parse().unwrap_or(0);
            let sign = if t.as_bytes()[p] == b'-' { -1 } else { 1 };
            return (&t[..p], Some(sign * (h * 3600 + m * 60)));
        }
    }
    (t, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mapping(cols: &[(Field, &str)], tz: &str) -> ColumnMapping {
        ColumnMapping {
            columns: cols.iter().map(|(f, h)| (*f, h.to_string())).collect(),
            timestamps_tz: tz.into(),
        }
    }

    fn basic(tz: &str) -> ColumnMapping {
        mapping(&[(Field::OpenTime, "Open"), (Field::CloseTime, "Close"), (Field::Profit, "Profit")], tz)
    }

    fn utc(s: &str) -> DateTime<Utc> {
        s.parse().unwrap()
    }

    #[test]
    fn timestamp_formats() {
        let tz = Tz::UTC;
        let want = utc("2024-01-02T10:00:00Z");
        for s in [
            "2024-01-02 10:00:00",
            "2024-01-02T10:00:00",
            "2024.01.02 10:00:00",
            "2024.01.02 10:00",
            "2024-01-02T10:00:00Z",
            "2024-01-02 12:00:00+02:00",
            "2024-01-02T05:00:00-0500",
        ] {
            assert_eq!(parse_time(s, tz), Some(want), "{s}");
        }
        assert_eq!(parse_time("2024.01.02 10:00:00.250", tz), Some(utc("2024-01-02T10:00:00.250Z")));
        assert_eq!(parse_time("not a date", tz), None);
        assert_eq!(parse_time("2024-13-02 10:00:00", tz), None);
    }

    #[test]
    fn naive_times_use_mapping_tz() {
        let csv = "Open,Close,Profit\n2024-01-02 18:00:00,2024-01-02 18:30:00,5\n";
        let out = parse_csv(csv, &basic("Asia/Manila")).unwrap();
        assert_eq!(out.trades[0].open, utc("2024-01-02T10:00:00Z"));
        // An explicit offset wins over the mapping timezone.
        let csv = "Open,Close,Profit\n2024-01-02 18:00:00Z,2024-01-02 18:30:00Z,5\n";
        let out = parse_csv(csv, &basic("Asia/Manila")).unwrap();
        assert_eq!(out.trades[0].open, utc("2024-01-02T18:00:00Z"));
    }

    #[test]
    fn headers_match_loosely_and_values_parse() {
        let csv = " open , CLOSE,profit,Type,Commission\n\
                   2024.01.02 10:00:00,2024.01.02 10:05:00, 10.5 ,Short,-0.5\n";
        let m = mapping(
            &[
                (Field::OpenTime, "Open"),
                (Field::CloseTime, "close"),
                (Field::Profit, "PROFIT "),
                (Field::Side, "type"),
                (Field::Commission, "commission"),
            ],
            "UTC",
        );
        let t = &parse_csv(csv, &m).unwrap().trades[0];
        assert_eq!(t.side, Side::Sell);
        assert_eq!(t.net, 10.0);
        assert_eq!(t.swap, 0.0);
        assert_eq!(t.sl, None);
    }

    #[test]
    fn missing_ticket_is_a_stable_hash() {
        let csv = "Open,Close,Profit\n2024-01-02 10:00:00,2024-01-02 10:30:00,5\n2024-01-02 11:00:00,2024-01-02 11:30:00,5\n";
        let a = parse_csv(csv, &basic("UTC")).unwrap();
        let b = parse_csv(csv, &basic("UTC")).unwrap();
        assert_eq!(a.trades[0].ticket, b.trades[0].ticket);
        assert_ne!(a.trades[0].ticket, a.trades[1].ticket);
        assert_eq!(a.trades[0].ticket.len(), 16);
        // FNV-1a 64 of "2024-01-02 10:00:00|2024-01-02 10:30:00|||5"
        assert_eq!(a.trades[0].ticket, format!("{:016x}", fnv1a(b"2024-01-02 10:00:00|2024-01-02 10:30:00|||5")));
        assert_eq!(fnv1a(b""), 0xcbf29ce484222325);
        assert_eq!(fnv1a(b"a"), 0xaf63dc4c8601ec8c);
    }

    #[test]
    fn bad_rows_are_skipped_and_counted() {
        let csv = "Open,Close,Profit\n\
                   2024-01-03 10:00:00,2024-01-03 10:30:00,5\n\
                   ,2024-01-02 10:30:00,5\n\
                   2024-01-02 10:00:00,2024-01-02 10:30:00,\n\
                   2024-01-02 10:00:00,2024-01-02 10:30:00,abc\n\
                   garbage,2024-01-02 10:30:00,5\n\
                   2024-01-02 10:00:00\n\
                   \n\
                   2024-01-01 10:00:00,2024-01-01 10:30:00,-5\n";
        let out = parse_csv(csv, &basic("UTC")).unwrap();
        assert_eq!(out.trades.len(), 2);
        assert_eq!(out.skipped_rows, 5);
        assert!(out.trades[0].open < out.trades[1].open, "sorted by open");
    }

    #[test]
    fn errors() {
        let m = mapping(&[(Field::OpenTime, "Open"), (Field::CloseTime, "Close")], "UTC");
        assert_eq!(parse_csv("Open,Close\n", &m), Err(ParseError::MissingMapping(Field::Profit)));

        // Optional column missing: ignored. Required column missing: error.
        let mut m = basic("UTC");
        m.columns.insert(Field::Symbol, "Instrument".into());
        assert_eq!(parse_csv("Open,Close,Profit\n", &m), Err(ParseError::NoTrades));
        let mut m = basic("UTC");
        m.columns.insert(Field::Profit, "PnL".into());
        assert_eq!(
            parse_csv("Open,Close,Profit\n", &m),
            Err(ParseError::MissingColumn("PnL".into()))
        );

        assert_eq!(
            parse_csv("Open,Close,Profit\n", &basic("Mars/Base")),
            Err(ParseError::BadTimezone("Mars/Base".into()))
        );

        assert_eq!(parse_csv("Open,Close,Profit\n", &basic("UTC")), Err(ParseError::NoTrades));
        assert_eq!(parse_csv("Open,Close,Profit\nx,y,z\n", &basic("UTC")), Err(ParseError::NoTrades));
    }
}
