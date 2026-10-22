//! Journal numbers: positions with their R, per-day stats and the summary by setup, grade,
//! mistake, plan and mood. Pure functions; the API loads the reviews and passes them in.
//! Contract: docs/journal-data.md.

use std::collections::{BTreeMap, HashMap};

use chrono::{DateTime, Utc};
use chrono_tz::Tz;
use serde::Serialize;

use crate::stats::round2;
use crate::{Side, Trade};

/// A group needs this many trades (days for moods) before the web app charts it.
pub const MIN_TRADES: u32 = 10;
pub const MIN_DAYS: u32 = 10;

/// Every partial close of one ticket, summed. `day` is the opening day in the timezone.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Position {
    pub ticket: String,
    pub day: String,
    /// First fill.
    pub open: DateTime<Utc>,
    /// Last close.
    pub close: DateTime<Utc>,
    pub symbol: String,
    pub side: Side,
    pub lots: f64,
    pub net: f64,
    pub open_price: f64,
    /// Lot-weighted average close price.
    pub close_price: f64,
    /// The last stop loss in the file.
    pub stop_loss: Option<f64>,
    /// The file's stop looks moved, so the app asks for the starting stop.
    pub ask_stop: bool,
    pub r: Option<f64>,
}

/// The answers the summary needs from one trade review.
#[derive(Debug, Clone, Default)]
pub struct ReviewFacts {
    pub ticket: String,
    pub followed_plan: Option<bool>,
    pub setup_id: Option<String>,
    pub grade: Option<String>,
    pub mistake_ids: Vec<String>,
    pub initial_stop: Option<f64>,
}

/// The answer the summary needs from one day review.
#[derive(Debug, Clone)]
pub struct DayFacts {
    pub day: String,
    pub pre_mood: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayStat {
    pub day: String,
    pub trades: u32,
    pub net: f64,
}

/// One group in the summary. For moods, `trades` counts days and `win_rate` is the share of green days.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    pub key: String,
    pub trades: u32,
    pub net: f64,
    pub win_rate: f64,
    pub avg_r: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub min_trades: u32,
    pub min_days: u32,
    pub by_mood: Vec<Row>,
    pub by_setup: Vec<Row>,
    pub by_grade: Vec<Row>,
    pub by_mistake: Vec<Row>,
    pub by_plan: Vec<Row>,
}

/// The file's stop looks moved: none, or at the entry or on the profit side of it.
pub fn stop_looks_moved(side: Side, open_price: f64, stop: Option<f64>) -> bool {
    match (stop, side) {
        (None, _) => true,
        (Some(s), Side::Buy) => s >= open_price,
        (Some(s), Side::Sell) => s <= open_price,
    }
}

/// R = (close - open) × direction ÷ |open - stop|. The starting stop wins, else the file's stop
/// when it was not moved. None without a usable stop.
pub fn r_of(
    side: Side,
    open: f64,
    close: f64,
    file_stop: Option<f64>,
    initial_stop: Option<f64>,
) -> Option<f64> {
    let stop = initial_stop.or(file_stop.filter(|_| !stop_looks_moved(side, open, file_stop)))?;
    if stop == open {
        return None;
    }
    let dir = if side == Side::Buy { 1.0 } else { -1.0 };
    Some(round2((close - open) * dir / (open - stop).abs()))
}

/// Trades grouped by ticket, newest first. `stops` holds the starting stop of reviewed tickets.
pub fn positions(trades: &[Trade], stops: &HashMap<String, f64>, tz: &str) -> Vec<Position> {
    let tz: Tz = tz.parse().unwrap_or(Tz::UTC);
    let mut by_ticket: BTreeMap<&str, Vec<&Trade>> = BTreeMap::new();
    for t in trades {
        by_ticket.entry(&t.ticket).or_default().push(t);
    }
    let mut out: Vec<Position> = by_ticket
        .into_iter()
        .map(|(ticket, fills)| {
            let first = fills.iter().min_by_key(|t| t.open).unwrap();
            let last = fills.iter().max_by_key(|t| t.close).unwrap();
            let lots: f64 = fills.iter().map(|t| t.lots).sum();
            let close_price = if lots > 0.0 {
                fills.iter().map(|t| t.close_price * t.lots).sum::<f64>() / lots
            } else {
                last.close_price
            };
            let close_price = (close_price * 1e5).round() / 1e5;
            Position {
                ticket: ticket.to_string(),
                day: first.open.with_timezone(&tz).format("%Y-%m-%d").to_string(),
                open: first.open,
                close: last.close,
                symbol: first.symbol.clone(),
                side: first.side,
                lots: round2(lots),
                net: round2(fills.iter().map(|t| t.net).sum()),
                open_price: first.open_price,
                close_price,
                stop_loss: last.sl,
                ask_stop: stop_looks_moved(first.side, first.open_price, last.sl),
                r: r_of(
                    first.side,
                    first.open_price,
                    close_price,
                    last.sl,
                    stops.get(ticket).copied(),
                ),
            }
        })
        .collect();
    out.sort_by(|a, b| b.open.cmp(&a.open).then_with(|| b.ticket.cmp(&a.ticket)));
    out
}

/// Trades and net per day, for every day in `positions` and in `extra_days`. Newest first.
pub fn day_stats(positions: &[Position], extra_days: &[String]) -> Vec<DayStat> {
    let mut m: BTreeMap<String, (u32, f64)> = BTreeMap::new();
    for p in positions {
        let e = m.entry(p.day.clone()).or_default();
        e.0 += 1;
        e.1 += p.net;
    }
    for d in extra_days {
        m.entry(d.clone()).or_default();
    }
    m.into_iter()
        .rev()
        .map(|(day, (trades, net))| DayStat {
            day,
            trades,
            net: round2(net),
        })
        .collect()
}

fn row(key: &str, items: &[&Position]) -> Row {
    let n = items.len() as u32;
    let rs: Vec<f64> = items.iter().filter_map(|p| p.r).collect();
    Row {
        key: key.into(),
        trades: n,
        net: round2(items.iter().map(|p| p.net).sum()),
        win_rate: if n > 0 {
            items.iter().filter(|p| p.net > 0.0).count() as f64 / n as f64
        } else {
            0.0
        },
        avg_r: (!rs.is_empty()).then(|| round2(rs.iter().sum::<f64>() / rs.len() as f64)),
    }
}

/// Groups reviewed positions by the keys each review gives. With `order`, those keys are listed
/// in that order even when empty; otherwise only keys with trades, most trades first.
fn group(
    reviewed: &[(&Position, &ReviewFacts)],
    keys: impl Fn(&ReviewFacts) -> Vec<String>,
    order: Option<&[&str]>,
) -> Vec<Row> {
    let mut m: BTreeMap<String, Vec<&Position>> = BTreeMap::new();
    for (p, r) in reviewed {
        for k in keys(r) {
            m.entry(k).or_default().push(p);
        }
    }
    match order {
        Some(order) => order
            .iter()
            .map(|k| row(k, m.get(*k).map_or(&[][..], |v| v)))
            .collect(),
        None => {
            let mut rows: Vec<Row> = m.iter().map(|(k, v)| row(k, v)).collect();
            rows.sort_by_key(|r| std::cmp::Reverse(r.trades));
            rows
        }
    }
}

/// P&L by setup, grade, mistake, plan (positions with an answer) and mood (trading days with a face).
pub fn summary(positions: &[Position], reviews: &[ReviewFacts], days: &[DayFacts]) -> Summary {
    let by_ticket: HashMap<&str, &ReviewFacts> =
        reviews.iter().map(|r| (r.ticket.as_str(), r)).collect();
    let reviewed: Vec<(&Position, &ReviewFacts)> = positions
        .iter()
        .filter_map(|p| by_ticket.get(p.ticket.as_str()).map(|r| (p, *r)))
        .collect();

    let mut on_day: HashMap<&str, Vec<&Position>> = HashMap::new();
    for p in positions {
        on_day.entry(&p.day).or_default().push(p);
    }
    let by_mood = ["1", "2", "3", "4", "5"]
        .iter()
        .map(|k| {
            let of: Vec<&Vec<&Position>> = days
                .iter()
                .filter(|d| d.pre_mood.map(|m| m.to_string()).as_deref() == Some(*k))
                .filter_map(|d| on_day.get(d.day.as_str()))
                .collect();
            let all: Vec<&Position> = of.iter().flat_map(|v| v.iter().copied()).collect();
            let green = of
                .iter()
                .filter(|v| v.iter().map(|p| p.net).sum::<f64>() > 0.0)
                .count();
            let n = of.len() as u32;
            Row {
                trades: n,
                win_rate: if n > 0 { green as f64 / n as f64 } else { 0.0 },
                ..row(k, &all)
            }
        })
        .collect();

    Summary {
        min_trades: MIN_TRADES,
        min_days: MIN_DAYS,
        by_mood,
        by_setup: group(&reviewed, |r| r.setup_id.iter().cloned().collect(), None),
        by_grade: group(
            &reviewed,
            |r| r.grade.iter().cloned().collect(),
            Some(&["A", "B", "C"]),
        ),
        by_mistake: group(&reviewed, |r| r.mistake_ids.clone(), None),
        by_plan: group(
            &reviewed,
            |r| {
                r.followed_plan
                    .map(|y| if y { "yes" } else { "no" }.to_string())
                    .into_iter()
                    .collect()
            },
            Some(&["yes", "no"]),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[allow(clippy::too_many_arguments)] // one line per fill reads better in the tests
    fn fill(
        ticket: &str,
        open: &str,
        mins: i64,
        side: Side,
        lots: f64,
        open_price: f64,
        close_price: f64,
        sl: Option<f64>,
        net: f64,
    ) -> Trade {
        let open: DateTime<Utc> = open.parse().unwrap();
        Trade {
            ticket: ticket.into(),
            open,
            close: open + chrono::Duration::minutes(mins),
            side,
            lots,
            symbol: "XAUUSD".into(),
            open_price,
            close_price,
            sl,
            tp: None,
            commission: 0.0,
            swap: 0.0,
            profit: net,
            net,
            reason: "tp".into(),
        }
    }

    #[test]
    fn stops_and_r() {
        // Buy at 100, stop 98, out at 104: 2R.
        assert_eq!(r_of(Side::Buy, 100.0, 104.0, Some(98.0), None), Some(2.0));
        // The stop was moved to breakeven: no R without a starting stop.
        assert!(stop_looks_moved(Side::Buy, 100.0, Some(100.0)));
        assert_eq!(r_of(Side::Buy, 100.0, 104.0, Some(100.0), None), None);
        assert_eq!(
            r_of(Side::Buy, 100.0, 104.0, Some(100.0), Some(96.0)),
            Some(1.0)
        );
        // Sell at 100, stop 101, out at 102: −2R.
        assert_eq!(
            r_of(Side::Sell, 100.0, 102.0, Some(101.0), None),
            Some(-2.0)
        );
        assert_eq!(r_of(Side::Sell, 100.0, 102.0, None, None), None);
    }

    #[test]
    fn partial_closes_make_one_position() {
        let trades = [
            fill(
                "t1",
                "2026-10-05T23:30:00Z",
                10,
                Side::Buy,
                0.1,
                100.0,
                102.0,
                Some(99.0),
                2.0,
            ),
            fill(
                "t1",
                "2026-10-05T23:30:00Z",
                40,
                Side::Buy,
                0.3,
                100.0,
                106.0,
                Some(99.0),
                18.0,
            ),
            fill(
                "t2",
                "2026-10-06T09:00:00Z",
                5,
                Side::Sell,
                0.1,
                50.0,
                51.0,
                None,
                -1.0,
            ),
        ];
        let stops = HashMap::from([("t2".to_string(), 50.5)]);
        let ps = positions(&trades, &stops, "Asia/Manila");
        assert_eq!(
            ps.iter().map(|p| p.ticket.as_str()).collect::<Vec<_>>(),
            ["t2", "t1"]
        );
        let t1 = &ps[1];
        // 23:30 UTC is the next morning in Manila.
        assert_eq!(
            (t1.day.as_str(), t1.lots, t1.net, t1.close_price),
            ("2026-10-06", 0.4, 20.0, 105.0)
        );
        assert_eq!(t1.close, trades[1].close);
        assert_eq!((t1.ask_stop, t1.r), (false, Some(5.0)));
        assert_eq!((ps[0].ask_stop, ps[0].r), (true, Some(-2.0)));
        assert_eq!(
            day_stats(&ps, &["2026-10-09".into()]),
            [
                DayStat {
                    day: "2026-10-09".into(),
                    trades: 0,
                    net: 0.0
                },
                DayStat {
                    day: "2026-10-06".into(),
                    trades: 2,
                    net: 19.0
                },
            ]
        );
    }

    #[test]
    fn summary_groups() {
        let trades = [
            fill(
                "a",
                "2026-10-05T09:00:00Z",
                5,
                Side::Buy,
                0.1,
                100.0,
                102.0,
                Some(99.0),
                2.0,
            ),
            fill(
                "b",
                "2026-10-05T10:00:00Z",
                5,
                Side::Buy,
                0.1,
                100.0,
                99.0,
                Some(99.0),
                -1.0,
            ),
            fill(
                "c",
                "2026-10-06T09:00:00Z",
                5,
                Side::Buy,
                0.1,
                100.0,
                103.0,
                None,
                3.0,
            ),
        ];
        let ps = positions(&trades, &HashMap::new(), "UTC");
        let review = |t: &str, plan: bool, setup: &str, mistakes: &[&str]| ReviewFacts {
            ticket: t.into(),
            followed_plan: Some(plan),
            setup_id: Some(setup.into()),
            grade: None,
            mistake_ids: mistakes.iter().map(|m| m.to_string()).collect(),
            initial_stop: None,
        };
        let reviews = [
            review("a", true, "s1", &[]),
            review("b", false, "s1", &["m1", "m2"]),
            review("c", true, "s2", &["m1"]),
        ];
        let days = [
            DayFacts {
                day: "2026-10-05".into(),
                pre_mood: Some(4),
            },
            DayFacts {
                day: "2026-10-07".into(),
                pre_mood: Some(2),
            },
        ];
        let s = summary(&ps, &reviews, &days);

        let s1 = &s.by_setup[0];
        assert_eq!(
            (s1.key.as_str(), s1.trades, s1.net, s1.win_rate, s1.avg_r),
            ("s1", 2, 1.0, 0.5, Some(0.5))
        );
        assert_eq!(
            s.by_mistake
                .iter()
                .map(|r| (r.key.as_str(), r.trades))
                .collect::<Vec<_>>(),
            [("m1", 2), ("m2", 1)]
        );
        assert_eq!(
            s.by_plan
                .iter()
                .map(|r| (r.key.as_str(), r.trades))
                .collect::<Vec<_>>(),
            [("yes", 2), ("no", 1)]
        );
        assert_eq!(
            s.by_grade.iter().map(|r| r.trades).collect::<Vec<_>>(),
            [0, 0, 0]
        );
        // Mood 4: one green day. Mood 2: its day has no trades, so it does not count.
        assert_eq!(
            (s.by_mood[3].trades, s.by_mood[3].net, s.by_mood[3].win_rate),
            (1, 1.0, 1.0)
        );
        assert_eq!(s.by_mood[1].trades, 0);
    }
}
