//! Grouping, statistics and what-if simulations. Port of the old TS group.ts, stats.ts
//! and simulate.ts. Every function takes trades in open-time order.

use std::collections::{HashMap, HashSet};

use chrono::{Days, NaiveDate};

use crate::{
    AfterLoss, BestLots, CapRow, DayBucket, EquityPoint, Group, LimitRow, LocalTrade, Side, Summary,
};

pub type Ts<'b, 'a> = [&'b LocalTrade<'a>];

pub const WEEKDAYS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/// JS `Math.round(n * 100) / 100` (halves round up).
pub fn round2(n: f64) -> f64 {
    (n * 100.0 + 0.5).floor() / 100.0
}

/// JS `String(n)` for the numbers we print (lots, loss limits).
/// ponytail: no exponent form, so values under 1e-6 or from 1e21 print differently from JS.
pub fn js_num(n: f64) -> String {
    if n == 0.0 {
        "0".into()
    } else {
        n.to_string()
    }
}

pub fn net(t: &LocalTrade) -> f64 {
    t.trade.net
}

pub fn sum_net(ts: &Ts) -> f64 {
    ts.iter().map(|t| net(t)).sum()
}

pub fn group(key: impl Into<String>, nets: impl IntoIterator<Item = f64>) -> Group {
    let (mut n, mut wins, mut total, mut gw, mut gl) = (0u32, 0u32, 0.0, 0.0, 0.0);
    for x in nets {
        n += 1;
        total += x;
        if x > 0.0 {
            wins += 1;
            gw += x;
        } else {
            gl += x;
        }
    }
    Group {
        key: key.into(),
        trades: n,
        wins,
        net: round2(total),
        win_rate: if n > 0 { wins as f64 / n as f64 } else { 0.0 },
        avg: if n > 0 { round2(total / n as f64) } else { 0.0 },
        gross_win: round2(gw),
        gross_loss: round2(gl),
    }
}

/// Group (key, net) pairs. Keys in `order` come first, in that order, even when empty;
/// other keys follow in first-seen order.
pub fn group_by(pairs: impl IntoIterator<Item = (String, f64)>, order: &[&str]) -> Vec<Group> {
    let mut keys: Vec<String> = order.iter().map(|k| k.to_string()).collect();
    let mut nets: Vec<Vec<f64>> = vec![Vec::new(); keys.len()];
    let mut at: HashMap<String, usize> = keys.iter().cloned().zip(0..).collect();
    for (k, x) in pairs {
        let i = *at.entry(k.clone()).or_insert_with(|| {
            keys.push(k);
            nets.push(Vec::new());
            keys.len() - 1
        });
        nets[i].push(x);
    }
    keys.into_iter()
        .zip(nets)
        .map(|(k, v)| group(k, v))
        .collect()
}

/// Trades per calendar day, days in first-seen order, each day sorted by open time.
pub fn per_day<'b, 'a>(ts: &Ts<'b, 'a>) -> Vec<Vec<&'b LocalTrade<'a>>> {
    let mut days: Vec<Vec<&LocalTrade>> = Vec::new();
    let mut at: HashMap<&str, usize> = HashMap::new();
    for &t in ts {
        let i = *at.entry(t.day.as_str()).or_insert_with(|| {
            days.push(Vec::new());
            days.len() - 1
        });
        days[i].push(t);
    }
    for d in &mut days {
        d.sort_by_key(|t| t.trade.open);
    }
    days
}

pub fn summary(ts: &Ts) -> Summary {
    let g = group("all", ts.iter().map(|t| net(t)));
    let wins = ts.iter().filter(|t| net(t) > 0.0).count();
    let losses = ts.len() - wins;
    let avg_win = if wins > 0 {
        g.gross_win / wins as f64
    } else {
        0.0
    };
    let avg_loss = if losses > 0 {
        g.gross_loss / losses as f64
    } else {
        0.0
    };

    let (mut max_dd, mut streak, mut max_loss_streak) = (0.0f64, 0u32, 0u32);
    for p in equity_curve(ts) {
        max_dd = max_dd.min(p.drawdown);
        streak = if p.net <= 0.0 { streak + 1 } else { 0 };
        max_loss_streak = max_loss_streak.max(streak);
    }
    let days = ts
        .iter()
        .map(|t| t.day.as_str())
        .collect::<HashSet<_>>()
        .len() as u32;
    let median = median(ts.iter().map(|t| t.duration_min).collect());
    let profit_factor = if g.gross_loss != 0.0 {
        Some((g.gross_win / g.gross_loss).abs())
    } else if g.gross_win > 0.0 {
        None
    } else {
        Some(0.0)
    };
    Summary {
        losses: losses as u32,
        avg_win: round2(avg_win),
        avg_loss: round2(avg_loss),
        payoff: if avg_loss != 0.0 {
            (avg_win / avg_loss).abs()
        } else {
            0.0
        },
        profit_factor,
        max_dd: round2(max_dd),
        max_loss_streak,
        days,
        trades_per_day: if days > 0 {
            ts.len() as f64 / days as f64
        } else {
            0.0
        },
        median_duration_min: median,
        best_trade: ts.iter().map(|t| net(t)).fold(f64::NEG_INFINITY, f64::max),
        worst_trade: ts.iter().map(|t| net(t)).fold(f64::INFINITY, f64::min),
        group: g,
    }
}

/// Cumulative net P&L in close order.
pub fn equity_curve(ts: &Ts) -> Vec<EquityPoint> {
    let mut by_close = ts.to_vec();
    by_close.sort_by_key(|t| t.trade.close);
    let (mut cum, mut peak) = (0.0f64, 0.0f64);
    by_close
        .iter()
        .enumerate()
        .map(|(i, t)| {
            cum += net(t);
            peak = peak.max(cum);
            EquityPoint {
                n: i as u32 + 1,
                time: t.trade.close.timestamp_millis(),
                equity: round2(cum),
                drawdown: round2(cum - peak),
                net: net(t),
            }
        })
        .collect()
}

pub fn daily(ts: &Ts) -> Vec<Group> {
    let mut g = group_by(ts.iter().map(|t| (t.day.clone(), net(t))), &[]);
    g.sort_by(|a, b| a.key.cmp(&b.key));
    g
}

/// Monday of the week that holds `day` (yyyy-mm-dd), as yyyy-mm-dd.
fn week_of(day: &str, weekday: u32) -> String {
    NaiveDate::parse_from_str(day, "%Y-%m-%d")
        .ok()
        .and_then(|d| d.checked_sub_days(Days::new(weekday.into())))
        .map_or_else(|| day.to_string(), |d| d.format("%Y-%m-%d").to_string())
}

/// One group per week, keyed by its Monday. Same open-time day as `daily`.
pub fn by_week(ts: &Ts) -> Vec<Group> {
    let mut g = group_by(ts.iter().map(|t| (week_of(&t.day, t.weekday), net(t))), &[]);
    g.sort_by(|a, b| a.key.cmp(&b.key));
    g
}

/// One group per month, key yyyy-mm. Same open-time day as `daily`.
pub fn by_month(ts: &Ts) -> Vec<Group> {
    let mut g = group_by(
        ts.iter()
            .map(|t| (t.day.get(..7).unwrap_or(&t.day).to_string(), net(t))),
        &[],
    );
    g.sort_by(|a, b| a.key.cmp(&b.key));
    g
}

pub fn by_hour(ts: &Ts) -> Vec<Group> {
    let order: Vec<String> = (0..24).map(|h| h.to_string()).collect();
    let order: Vec<&str> = order.iter().map(String::as_str).collect();
    group_by(ts.iter().map(|t| (t.hour.to_string(), net(t))), &order)
}

pub fn by_weekday(ts: &Ts) -> Vec<Group> {
    let g = group_by(
        ts.iter()
            .map(|t| (WEEKDAYS[t.weekday as usize].to_string(), net(t))),
        &WEEKDAYS,
    );
    g.into_iter()
        .enumerate()
        .filter(|(i, g)| *i < 5 || g.trades > 0)
        .map(|(_, g)| g)
        .collect()
}

/// 7 x 24 grid: [weekday][hour], keys "d-h".
pub fn heatmap(ts: &Ts) -> Vec<Vec<Group>> {
    let mut cells = vec![Vec::new(); 7 * 24];
    for t in ts {
        cells[t.weekday as usize * 24 + t.hour as usize].push(net(t));
    }
    let mut cells = cells.into_iter();
    (0..7)
        .map(|d| {
            (0..24)
                .map(|h| group(format!("{d}-{h}"), cells.next().unwrap()))
                .collect()
        })
        .collect()
}

const DURATION: [(&str, f64); 6] = [
    ("< 1m", 1.0),
    ("1–5m", 5.0),
    ("5–15m", 15.0),
    ("15–60m", 60.0),
    ("1–4h", 240.0),
    ("4h+", f64::INFINITY),
];

pub(crate) fn duration_label(m: f64) -> &'static str {
    DURATION
        .iter()
        .find(|(_, max)| m < *max)
        .map_or("4h+", |d| d.0)
}

pub fn by_duration(ts: &Ts) -> Vec<Group> {
    let order = DURATION.map(|d| d.0);
    let g = group_by(
        ts.iter()
            .map(|t| (duration_label(t.duration_min).to_string(), net(t))),
        &order,
    );
    g.into_iter().filter(|g| g.trades > 0).collect()
}

pub(crate) fn median(mut xs: Vec<f64>) -> f64 {
    xs.sort_by(f64::total_cmp);
    let m = xs.len() / 2;
    match xs.len() {
        0 => 0.0,
        n if !n.is_multiple_of(2) => xs[m],
        _ => (xs[m - 1] + xs[m]) / 2.0,
    }
}

/// Lot sizes per symbol, keys "XAUUSD · 0.2", sorted by symbol then lots.
pub fn by_lots(ts: &Ts) -> Vec<Group> {
    let mut g = group_by(
        ts.iter().map(|t| {
            (
                format!("{} · {}", t.trade.symbol, js_num(t.trade.lots)),
                net(t),
            )
        }),
        &[],
    );
    let split = |k: &str| {
        let (s, l) = k.split_once(" · ").unwrap_or((k, ""));
        (s.to_string(), l.parse::<f64>().unwrap_or(f64::NAN))
    };
    // ponytail: plain string order for symbols, where TS used localeCompare.
    g.sort_by(|a, b| {
        let (x, y) = (split(&a.key), split(&b.key));
        x.0.cmp(&y.0)
            .then(x.1.partial_cmp(&y.1).unwrap_or(std::cmp::Ordering::Equal))
    });
    g
}

/// A lot size needs this many trades on a symbol before it can be the best or worst,
/// so one lucky trade does not win.
pub const MIN_LOT_TRADES: u32 = 5;

/// Per symbol (most traded first): the lot size with the highest net and the one with the
/// lowest. Ties go to the smaller size.
pub fn best_lots(ts: &Ts) -> Vec<BestLots> {
    by_symbol(ts)
        .into_iter()
        .map(|s| {
            let mine = ts.iter().filter(|t| t.trade.symbol == s.key);
            let mut sizes: Vec<Group> = group_by(mine.map(|t| (js_num(t.trade.lots), net(t))), &[])
                .into_iter()
                .filter(|g| g.trades >= MIN_LOT_TRADES)
                .collect();
            let lots = |g: &Group| g.key.parse::<f64>().unwrap_or(f64::NAN);
            sizes.sort_by(|a, b| lots(a).total_cmp(&lots(b)));
            let pick = |better: fn(f64, f64) -> bool| {
                sizes
                    .iter()
                    .fold(None::<&Group>, |b, g| match b {
                        Some(b) if !better(g.net, b.net) => Some(b),
                        _ => Some(g),
                    })
                    .cloned()
            };
            BestLots {
                symbol: s.key,
                best: pick(|x, y| x > y).filter(|g| g.net > 0.0),
                worst: pick(|x, y| x < y).filter(|g| g.net < 0.0),
                sizes: sizes.len() as u32,
            }
        })
        .collect()
}

pub fn reason_label(r: &str) -> String {
    match r {
        "sl" => "Stop loss",
        "tp" => "Take profit",
        "user" => "Manual",
        "so" => "Stop-out",
        "" => "Unknown",
        other => other,
    }
    .to_string()
}

pub fn by_reason(ts: &Ts) -> Vec<Group> {
    by_count(group_by(
        ts.iter().map(|t| (reason_label(&t.trade.reason), net(t))),
        &[],
    ))
}

pub fn by_symbol(ts: &Ts) -> Vec<Group> {
    by_count(group_by(
        ts.iter().map(|t| (t.trade.symbol.clone(), net(t))),
        &[],
    ))
}

/// Most trades first; ties keep their order.
pub fn by_count(mut g: Vec<Group>) -> Vec<Group> {
    g.sort_by_key(|x| std::cmp::Reverse(x.trades));
    g
}

pub fn by_side(ts: &Ts) -> Vec<Group> {
    let side = |t: &LocalTrade| {
        if t.trade.side == Side::Buy {
            "Buy"
        } else {
            "Sell"
        }
    };
    let g = group_by(
        ts.iter().map(|t| (side(t).to_string(), net(t))),
        &["Buy", "Sell"],
    );
    g.into_iter().filter(|g| g.trades > 0).collect()
}

/// Result of the 1st, 2nd, ... trade of each day; the 12th and later share "12+".
pub fn nth_trade(ts: &Ts) -> Vec<Group> {
    const CAP: usize = 12;
    let label = |n: usize| {
        if n >= CAP {
            format!("{CAP}+")
        } else {
            n.to_string()
        }
    };
    let order: Vec<String> = (1..=CAP).map(label).collect();
    let order: Vec<&str> = order.iter().map(String::as_str).collect();
    let rows = per_day(ts).into_iter().flat_map(|d| {
        d.into_iter()
            .enumerate()
            .map(|(i, t)| (label(i + 1), net(t)))
    });
    group_by(rows, &order)
        .into_iter()
        .filter(|g| g.trades > 0)
        .collect()
}

/// Average daily result, grouped by how many trades were taken that day.
pub fn day_buckets(ts: &Ts) -> Vec<DayBucket> {
    const BUCKETS: [(&str, usize, usize); 6] = [
        ("1–2", 1, 2),
        ("3–5", 3, 5),
        ("6–10", 6, 10),
        ("11–15", 11, 15),
        ("16–25", 16, 25),
        ("26+", 26, usize::MAX),
    ];
    let days = per_day(ts);
    BUCKETS
        .iter()
        .map(|&(label, lo, hi)| {
            let nets: Vec<f64> = days
                .iter()
                .filter(|d| d.len() >= lo && d.len() <= hi)
                .map(|d| sum_net(d))
                .collect();
            let total: f64 = nets.iter().sum();
            DayBucket {
                key: label.into(),
                days: nets.len() as u32,
                net: round2(total),
                avg_per_day: if nets.is_empty() {
                    0.0
                } else {
                    round2(total / nets.len() as f64)
                },
                green_days: nets.iter().filter(|&&x| x > 0.0).count() as u32,
            }
        })
        .filter(|b| b.days > 0)
        .collect()
}

/// Net P&L if you stopped after N trades each day, N up to 25.
pub fn cap_sim(ts: &Ts) -> Vec<CapRow> {
    let days = per_day(ts);
    let max_n = days.iter().map(Vec::len).max().unwrap_or(0).clamp(1, 25);
    (1..=max_n)
        .map(|cap| {
            let kept: Vec<f64> = days
                .iter()
                .flat_map(|d| d.iter().take(cap).map(|t| net(t)))
                .collect();
            CapRow {
                key: cap.to_string(),
                cap: cap as u32,
                net: round2(kept.iter().sum()),
                trades: kept.len() as u32,
            }
        })
        .collect()
}

/// Net P&L if you stopped for the day once the day's loss reached the limit.
pub fn loss_limit_sim(ts: &Ts) -> Vec<LimitRow> {
    let days = per_day(ts);
    let worst = days
        .iter()
        .map(|d| {
            let (mut c, mut low) = (0.0f64, 0.0f64);
            for t in d {
                c += net(t);
                low = low.min(c);
            }
            low
        })
        .fold(0.0f64, f64::min)
        .abs();
    if worst == 0.0 {
        return Vec::new();
    }
    let step = nice_step(worst / 12.0);
    let mut limits = Vec::new();
    let mut l = step;
    while l < worst + step {
        limits.push(round2(l));
        l += step;
    }
    limits
        .into_iter()
        .map(|limit| {
            let (mut total, mut count, mut stopped) = (0.0, 0u32, 0u32);
            for d in &days {
                let mut c = 0.0;
                for t in d {
                    c += net(t);
                    total += net(t);
                    count += 1;
                    if c <= -limit {
                        stopped += 1;
                        break;
                    }
                }
            }
            LimitRow {
                key: format!("${}", js_num(limit)),
                limit,
                net: round2(total),
                trades: count,
                stopped_days: stopped,
            }
        })
        .collect()
}

fn nice_step(x: f64) -> f64 {
    let p = 10f64.powf(x.log10().floor());
    let m = x / p;
    let k = if m < 1.5 {
        1.0
    } else if m < 3.5 {
        2.0
    } else if m < 7.5 {
        5.0
    } else {
        10.0
    };
    k * p
}

/// Trades opened within 10 minutes after a losing trade closed, against all others.
pub fn after_loss(ts: &Ts) -> AfterLoss {
    const WINDOW_MIN: u32 = 10;
    let window = WINDOW_MIN as i64 * 60_000;
    let losses: Vec<(usize, i64)> = ts
        .iter()
        .enumerate()
        .filter(|(_, t)| net(t) < 0.0)
        .map(|(i, t)| (i, t.trade.close.timestamp_millis()))
        .collect();
    let (mut after, mut other) = (Vec::new(), Vec::new());
    for (i, t) in ts.iter().enumerate() {
        let open = t.trade.open.timestamp_millis();
        // ponytail: O(trades × losses) scan, fine for a few thousand trades.
        let hit = losses
            .iter()
            .any(|&(j, close)| j != i && close <= open && open - close <= window);
        if hit {
            after.push(net(t))
        } else {
            other.push(net(t))
        }
    }
    AfterLoss {
        window_min: WINDOW_MIN,
        after: group("after", after),
        other: group("other", other),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{analyze, Filters, Trade};
    use chrono::{DateTime, Utc};

    #[test]
    fn round2_matches_js() {
        assert_eq!(round2(1.005), 1.0); // 1.005 * 100 = 100.49999...
        assert_eq!(round2(2.5 / 100.0), 0.03);
        assert_eq!(round2(-0.125), -0.12); // JS rounds halves toward +infinity
        assert_eq!(round2(-28.53 - 0.5), -29.03);
    }

    #[test]
    fn js_numbers() {
        assert_eq!(js_num(0.1), "0.1");
        assert_eq!(js_num(1.0), "1");
        assert_eq!(js_num(-0.0), "0");
        assert_eq!(js_num(12.5), "12.5");
    }

    fn trade(open: &str, symbol: &str, lots: f64, net: f64) -> Trade {
        let open: DateTime<Utc> = open.parse().unwrap();
        Trade {
            ticket: format!("{open}{symbol}{lots}{net}"),
            open,
            close: open + chrono::Duration::minutes(5),
            side: Side::Buy,
            lots,
            symbol: symbol.into(),
            open_price: 1.0,
            close_price: 1.0,
            sl: None,
            tp: None,
            commission: 0.0,
            swap: 0.0,
            profit: net,
            net,
            reason: "tp".into(),
        }
    }

    fn filters(tz: &str) -> Filters {
        Filters {
            range_days: None,
            symbol: None,
            side: None,
            tz: tz.into(),
        }
    }

    #[test]
    fn weeks_and_months() {
        let trades = [
            // Sunday 23:30 UTC is already Monday 07:30 in Manila.
            trade("2026-10-11T23:30:00Z", "XAUUSD", 0.1, 10.0),
            trade("2026-10-12T09:00:00Z", "XAUUSD", 0.1, -4.0),
            trade("2026-10-18T12:00:00Z", "XAUUSD", 0.1, 3.0),
            trade("2026-09-30T12:00:00Z", "XAUUSD", 0.1, 5.0),
        ];
        let keys = |g: &[Group]| g.iter().map(|g| g.key.clone()).collect::<Vec<_>>();

        let utc = analyze(&trades, &filters("UTC")).unwrap();
        assert_eq!(
            keys(&utc.by_week),
            ["2026-09-28", "2026-10-05", "2026-10-12"]
        );
        assert_eq!(utc.by_week[2].trades, 2);
        assert_eq!(utc.by_week[2].net, -1.0);
        assert_eq!(keys(&utc.by_month), ["2026-09", "2026-10"]);
        assert_eq!(utc.by_month[1].net, 9.0);
        assert_eq!(utc.by_month[1].wins, 2);

        let manila = analyze(&trades, &filters("Asia/Manila")).unwrap();
        assert_eq!(keys(&manila.by_week), ["2026-09-28", "2026-10-12"]);
        assert_eq!(manila.by_week[1].trades, 3);
        assert_eq!(manila.by_week[1].net, 9.0);
    }

    #[test]
    fn best_and_worst_lots() {
        let mut trades = Vec::new();
        let mut add = |symbol: &str, lots: f64, nets: &[f64]| {
            for (i, &n) in nets.iter().enumerate() {
                let open = format!("2026-10-{:02}T10:00:00Z", i + 1);
                trades.push(trade(&open, symbol, lots, n));
            }
        };
        add("XAUUSD", 0.01, &[1.0; 5]);
        add("XAUUSD", 0.02, &[4.0, 4.0, -1.0, 4.0, 4.0]);
        add("XAUUSD", 0.05, &[-10.0, 2.0, -10.0, -10.0, 2.0]);
        // One huge win on too few trades does not count.
        add("XAUUSD", 1.0, &[500.0]);
        add("EURUSD", 0.1, &[-1.0; 5]);
        add("EURUSD", 0.2, &[5.0; 4]);
        add("BTCUSD", 0.1, &[2.0; 6]);

        let a = analyze(&trades, &filters("UTC")).unwrap();
        let rows: Vec<_> = a.best_lots.iter().map(|b| b.symbol.as_str()).collect();
        assert_eq!(rows, ["XAUUSD", "EURUSD", "BTCUSD"]);

        let xau = &a.best_lots[0];
        assert_eq!(xau.sizes, 3);
        let best = xau.best.as_ref().unwrap();
        assert_eq!(
            (best.key.as_str(), best.net, best.trades),
            ("0.02", 15.0, 5)
        );
        assert_eq!(xau.worst.as_ref().unwrap().key, "0.05");

        // Only a losing size qualifies: no best.
        let eur = &a.best_lots[1];
        assert_eq!(eur.sizes, 1);
        assert!(eur.best.is_none());
        assert_eq!(eur.worst.as_ref().unwrap().key, "0.1");

        // Only a winning size: no worst.
        let btc = &a.best_lots[2];
        assert_eq!(btc.best.as_ref().unwrap().key, "0.1");
        assert!(btc.worst.is_none());
    }

    #[test]
    fn best_lots_ties_go_to_the_smaller_size() {
        let mut trades = Vec::new();
        for lots in [0.2, 0.1] {
            for d in 1..=5 {
                trades.push(trade(
                    &format!("2026-10-0{d}T10:00:00Z"),
                    "XAUUSD",
                    lots,
                    2.0,
                ));
            }
        }
        let a = analyze(&trades, &filters("UTC")).unwrap();
        assert_eq!(a.best_lots[0].best.as_ref().unwrap().key, "0.1");
        assert_eq!(a.best_lots[0].sizes, 2);
    }

    #[test]
    fn nice_steps() {
        assert_eq!(nice_step(1.2), 1.0);
        assert_eq!(nice_step(3.0), 2.0);
        assert_eq!(nice_step(40.0), 50.0);
        assert_eq!(nice_step(8.0), 10.0);
    }
}
