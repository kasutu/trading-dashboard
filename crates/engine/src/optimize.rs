//! Rule optimizer. Port of the old TS optimize.ts.

use std::collections::HashMap;

use crate::stats::{
    by_duration, by_hour, by_symbol, by_weekday, daily, group, loss_limit_sim, net, per_day, round2, sum_net, Ts,
    WEEKDAYS,
};
use crate::{ComparePoint, Comparison, FocusItem, FocusKind, Group, LocalTrade, Merged, Optimization, Rules};

/// An hour or weekday needs this many trades before we skip or pick it.
const MIN_TRADES: u32 = 5;
const TRAIN_SHARE: f64 = 0.7;
/// Rules must keep 40% of trades, so "stop trading" is never the answer.
const MIN_KEEP: f64 = 0.4;

fn no_rules() -> Rules {
    Rules { skip_hours: vec![], skip_weekdays: vec![], cap: None, loss_limit: None }
}

/// Trades you would have taken under the rules. `days` comes from `per_day`.
/// ponytail: assumes trades are independent, so a skipped trade does not change later ones.
fn apply_rules<'b, 'a>(days: &[Vec<&'b LocalTrade<'a>>], r: &Rules) -> Vec<&'b LocalTrade<'a>> {
    let mut kept = Vec::new();
    for day in days {
        let (mut n, mut day_net) = (0u32, 0.0);
        for &t in day {
            if r.skip_hours.contains(&t.hour) || r.skip_weekdays.contains(&t.weekday) {
                continue;
            }
            if r.cap.is_some_and(|c| n >= c) || r.loss_limit.is_some_and(|l| day_net <= -l) {
                break;
            }
            kept.push(t);
            n += 1;
            day_net += net(t);
        }
    }
    kept
}

/// Best rules by net P&L on the training trades: losing hours/weekdays added worst first,
/// then a full grid of caps and loss limits on top of each skip set. Looser rules win ties.
fn fit(train: &Ts) -> (Rules, u32) {
    let days = per_day(train);
    let min_kept = (train.len() as f64 * MIN_KEEP).ceil() as usize;

    enum Skip {
        Hour(u32),
        Weekday(u32),
    }
    let hours = by_hour(train).into_iter().map(|g| {
        let s = Skip::Hour(g.key.parse().unwrap_or(0));
        (g, s)
    });
    let weekdays = by_weekday(train).into_iter().map(|g| {
        let s = Skip::Weekday(WEEKDAYS.iter().position(|w| *w == g.key).unwrap_or(0) as u32);
        (g, s)
    });
    let mut candidates: Vec<(Group, Skip)> =
        hours.chain(weekdays).filter(|(g, _)| g.trades >= MIN_TRADES && g.net < 0.0).collect();
    candidates.sort_by(|a, b| a.0.net.total_cmp(&b.0.net));

    let mut bases = vec![no_rules()];
    for (_, skip) in &candidates {
        let mut next = bases.last().unwrap().clone();
        match *skip {
            Skip::Hour(h) => next.skip_hours.push(h),
            Skip::Weekday(d) => next.skip_weekdays.push(d),
        }
        if apply_rules(&days, &next).len() < min_kept {
            break;
        }
        bases.push(next);
    }

    let mut best = no_rules();
    let mut best_net = sum_net(train);
    let mut tested = 0;
    for base in &bases {
        let filtered = apply_rules(&days, base);
        let max_per_day = per_day(&filtered).iter().map(Vec::len).max().unwrap_or(0).max(1) as u32;
        let caps = std::iter::once(None).chain((1..=max_per_day).rev().map(Some));
        let limits: Vec<Option<f64>> =
            std::iter::once(None).chain(loss_limit_sim(&filtered).iter().rev().map(|l| Some(l.limit))).collect();
        for cap in caps {
            for &loss_limit in &limits {
                let r = Rules { cap, loss_limit, ..base.clone() };
                let kept = apply_rules(&days, &r);
                tested += 1;
                if kept.len() < min_kept {
                    continue;
                }
                let n = sum_net(&kept);
                if n > best_net + 0.005 {
                    best = r;
                    best_net = n;
                }
            }
        }
    }
    (best, tested)
}

fn merge(gs: &[Group]) -> Merged {
    let trades: u32 = gs.iter().map(|g| g.trades).sum();
    let wins: u32 = gs.iter().map(|g| g.wins).sum();
    Merged {
        trades,
        net: round2(gs.iter().map(|g| g.net).sum()),
        win_rate: if trades > 0 { wins as f64 / trades as f64 } else { 0.0 },
    }
}

/// What made money on the fit days (top hours, weekdays, symbol, holding time), and how
/// it did on the test days.
fn focus(train: &Ts, test: &Ts) -> Vec<FocusItem> {
    type By = fn(&Ts) -> Vec<Group>;
    let kinds: [(FocusKind, By, usize); 4] = [
        (FocusKind::Hour, by_hour, 3),
        (FocusKind::Weekday, by_weekday, 2),
        (FocusKind::Symbol, by_symbol, 1),
        (FocusKind::Duration, by_duration, 1),
    ];
    kinds
        .into_iter()
        .filter_map(|(kind, by, top)| {
            let mut picks: Vec<Group> =
                by(train).into_iter().filter(|g| g.trades >= MIN_TRADES && g.net > 0.0).collect();
            picks.sort_by(|a, b| b.net.total_cmp(&a.net));
            picks.truncate(top);
            if picks.is_empty() {
                return None;
            }
            let mut keys: Vec<String> = picks.iter().map(|g| g.key.clone()).collect();
            if kind == FocusKind::Hour {
                keys.sort_by_key(|k| k.parse::<u32>().unwrap_or(0));
            }
            let tested: Vec<Group> = by(test).into_iter().filter(|g| keys.contains(&g.key)).collect();
            Some(FocusItem { kind, keys, fit: merge(&picks), test: merge(&tested) })
        })
        .collect()
}

fn compare(ts: &Ts, r: &Rules) -> Comparison {
    let kept = apply_rules(&per_day(ts), r);
    Comparison {
        actual: group("actual", ts.iter().map(|t| net(t))),
        with_rules: group("rules", kept.iter().map(|t| net(t))),
    }
}

/// Fit rules on the first 70% of days, test them on the rest. None with too little data.
pub fn optimize(ts: &Ts) -> Option<Optimization> {
    let mut day_keys: Vec<&str> = ts.iter().map(|t| t.day.as_str()).collect();
    day_keys.sort_unstable();
    day_keys.dedup();
    if day_keys.len() < 10 || ts.len() < 30 {
        return None;
    }
    let split_at = (day_keys.len() as f64 * TRAIN_SHARE).floor() as usize;
    let split_day = day_keys[split_at];
    let train: Vec<&LocalTrade> = ts.iter().copied().filter(|t| t.day.as_str() < split_day).collect();
    let test: Vec<&LocalTrade> = ts.iter().copied().filter(|t| t.day.as_str() >= split_day).collect();
    let (rules, tested) = fit(&train);

    // Cumulative daily net, actual vs with rules
    let ruled: HashMap<String, f64> =
        daily(&apply_rules(&per_day(ts), &rules)).into_iter().map(|d| (d.key, d.net)).collect();
    let (mut a, mut b) = (0.0, 0.0);
    let curve = daily(ts)
        .into_iter()
        .map(|d| {
            a += d.net;
            b += ruled.get(&d.key).copied().unwrap_or(0.0);
            ComparePoint { key: d.key, actual: round2(a), rules: round2(b) }
        })
        .collect();

    Some(Optimization {
        focus: focus(&train, &test),
        train: compare(&train, &rules),
        test: compare(&test, &rules),
        all: compare(ts, &rules),
        rules,
        tested,
        split_day: split_day.to_string(),
        train_days: [day_keys[0].to_string(), day_keys[split_at - 1].to_string()],
        test_days: [split_day.to_string(), day_keys[day_keys.len() - 1].to_string()],
        curve,
    })
}
