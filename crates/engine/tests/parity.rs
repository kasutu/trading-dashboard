//! Parity with the old TypeScript engine. Goldens come from `gen_goldens.ts`.

use std::path::Path;

use engine::{analyze, exness_mapping, filter_trades, parse_csv, Filters, Side};
use serde_json::Value;

/// Analytics fields added after the port. The TS engine never had them, so the goldens
/// do not either; they have their own unit tests in `src/stats.rs`.
const AFTER_PORT: [&str; 4] = ["byWeek", "byMonth", "bestLots", "overtrading"];

fn fixture(name: &str) -> String {
    std::fs::read_to_string(
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name),
    )
    .unwrap()
}

/// Compare recursively: keys, strings and lengths exact; numbers within 0.011
/// (or 1e-6 relative for large ones).
fn compare(path: &str, got: &Value, want: &Value, errs: &mut Vec<String>) {
    match (got, want) {
        (Value::Number(a), Value::Number(b)) => {
            let (a, b) = (a.as_f64().unwrap(), b.as_f64().unwrap());
            if (a - b).abs() > 0.011_f64.max(b.abs() * 1e-6) {
                errs.push(format!("{path}: got {a}, want {b}"));
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                errs.push(format!("{path}: length {} != {}", a.len(), b.len()));
            }
            for (i, (x, y)) in a.iter().zip(b).enumerate() {
                compare(&format!("{path}[{i}]"), x, y, errs);
            }
        }
        (Value::Object(a), Value::Object(b)) => {
            let ka: Vec<_> = a.keys().collect();
            let kb: Vec<_> = b.keys().collect();
            if ka != kb {
                errs.push(format!("{path}: keys {ka:?} != {kb:?}"));
            }
            for (k, y) in b {
                if let Some(x) = a.get(k) {
                    compare(&format!("{path}.{k}"), x, y, errs);
                }
            }
        }
        _ if got != want => errs.push(format!("{path}: got {got}, want {want}")),
        _ => {}
    }
}

#[test]
fn matches_typescript_goldens() {
    let cases = [
        ("utc-all", None, None, "UTC"),
        ("manila-all", None, None, "Asia/Manila"),
        ("utc-30-xauusd", Some(30), Some("XAUUSD"), "UTC"),
    ];
    let mut errs = Vec::new();
    for name in ["exness-losing", "exness-winning"] {
        let parsed = parse_csv(&fixture(&format!("{name}.csv")), &exness_mapping()).unwrap();
        assert_eq!(parsed.skipped_rows, 0);
        for (case, range_days, symbol, tz) in cases {
            let filters = Filters {
                range_days,
                symbol: symbol.map(Into::into),
                side: None,
                tz: tz.into(),
            };
            let mut got = serde_json::to_value(analyze(&parsed.trades, &filters).unwrap()).unwrap();
            for key in AFTER_PORT {
                got.as_object_mut().unwrap().remove(key);
            }
            let want: Value =
                serde_json::from_str(&fixture(&format!("{name}.{case}.golden.json"))).unwrap();
            compare(&format!("{name}.{case}"), &got, &want, &mut errs);
        }
    }
    assert!(
        errs.is_empty(),
        "{} differences:\n{}",
        errs.len(),
        errs[..errs.len().min(40)].join("\n")
    );
}

#[test]
fn analyze_none_when_nothing_matches() {
    let parsed = parse_csv(&fixture("exness-winning.csv"), &exness_mapping()).unwrap();
    let filters = Filters {
        range_days: None,
        symbol: Some("NOPE".into()),
        side: None,
        tz: "UTC".into(),
    };
    assert!(analyze(&parsed.trades, &filters).is_none());
}

#[test]
fn filter_trades_newest_first_within_days() {
    let parsed = parse_csv(&fixture("exness-winning.csv"), &exness_mapping()).unwrap();
    let filters = Filters {
        range_days: None,
        symbol: None,
        side: Some(Side::Sell),
        tz: "Asia/Manila".into(),
    };
    let rows = filter_trades(
        &parsed.trades,
        &filters,
        Some("2026-08-10"),
        Some("2026-08-20"),
    );
    assert!(!rows.is_empty());
    assert!(rows.windows(2).all(|w| w[0].trade.open >= w[1].trade.open));
    assert!(rows.iter().all(|t| t.trade.side == Side::Sell
        && t.day.as_str() >= "2026-08-10"
        && t.day.as_str() <= "2026-08-20"));
    let json = serde_json::to_value(&rows[0]).unwrap();
    assert!(json.get("ticket").is_some() && json.get("durationMin").is_some());
}
