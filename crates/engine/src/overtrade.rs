//! Overtrading: how many trades fit in a day at the holding time that made the most.

use crate::stats::{
    by_duration, duration_label, group, median, net, per_day, round2, Ts, MIN_LOT_TRADES,
};
use crate::{BestDuration, Group, LocalTrade, OvertradeDay, Overtrading};

/// The holding-time bucket with the highest net, among buckets with at least
/// `MIN_LOT_TRADES` trades. None unless that net is above 0. Ties go to the shorter bucket.
pub fn best_duration(ts: &Ts) -> Option<BestDuration> {
    let best = by_duration(ts)
        .into_iter()
        .filter(|g| g.trades >= MIN_LOT_TRADES && g.net > 0.0)
        .fold(None::<Group>, |b, g| match b {
            Some(b) if g.net <= b.net => Some(b),
            _ => Some(g),
        })?;
    let mins = ts
        .iter()
        .filter(|t| duration_label(t.duration_min) == best.key)
        .map(|t| t.duration_min)
        .collect();
    Some(BestDuration {
        key: best.key,
        median_min: round2(median(mins)),
        trades: best.trades,
        net: best.net,
    })
}

/// Minutes with at least one trade open. Overlapping trades count once.
fn in_market_min(day: &[&LocalTrade]) -> f64 {
    // per_day sorts by open time.
    let mut total = chrono::Duration::zero();
    let mut cur: Option<(chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>)> = None;
    for t in day {
        let (o, c) = (t.trade.open, t.trade.close);
        cur = match cur {
            Some((s, e)) if o <= e => Some((s, e.max(c))),
            Some((s, e)) => {
                total += e - s;
                Some((o, c))
            }
            None => Some((o, c)),
        };
    }
    if let Some((s, e)) = cur {
        total += e - s;
    }
    total.num_milliseconds() as f64 / 60_000.0
}

/// Per day: trades taken, and how many trades of the best holding time fit in the time the
/// trader was in the market. A day over that count is an overtrading day: trades cut short,
/// or stacked on top of each other.
pub fn overtrading(ts: &Ts) -> Overtrading {
    let best = best_duration(ts);
    let mut days: Vec<OvertradeDay> = per_day(ts)
        .into_iter()
        .map(|d| {
            let span_min = in_market_min(&d);
            let allowed = best
                .as_ref()
                .filter(|b| b.median_min > 0.0)
                .map(|b| ((span_min / b.median_min).floor() as u32).max(1));
            let trades = d.len() as u32;
            OvertradeDay {
                day: d[0].day.clone(),
                trades,
                span_min: round2(span_min),
                allowed,
                over: allowed.is_some_and(|a| trades > a),
                net: round2(d.iter().map(|t| net(t)).sum()),
            }
        })
        .collect();
    days.sort_by(|a, b| a.day.cmp(&b.day));
    let nets = |over: bool| days.iter().filter(move |d| d.over == over).map(|d| d.net);
    Overtrading {
        over: group("over", nets(true)),
        within: group("within", nets(false)),
        best,
        days,
    }
}

#[cfg(test)]
mod tests {
    use crate::{analyze, Filters, Side, Trade};
    use chrono::{DateTime, Utc};

    fn filters(tz: &str) -> Filters {
        Filters {
            range_days: None,
            symbol: None,
            side: None,
            tz: tz.into(),
        }
    }

    /// A trade held `hold` minutes, opened at `open` (UTC).
    fn held(open: &str, hold: i64, net: f64) -> Trade {
        let open: DateTime<Utc> = open.parse().unwrap();
        Trade {
            ticket: format!("{open}{hold}{net}"),
            open,
            close: open + chrono::Duration::minutes(hold),
            side: Side::Buy,
            lots: 0.1,
            symbol: "XAUUSD".into(),
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

    #[test]
    fn overtrading_days() {
        let mut trades = Vec::new();
        // Five 30-minute winners: 15–60m is the best holding time, median 30 min.
        for d in 1..=5 {
            trades.push(held(&format!("2026-10-0{d}T09:00:00Z"), 30, 10.0));
        }
        // Oct 6: 9:00-9:40 and 10:00-11:00 overlap into 100 min in the market: room for
        // 3 trades of 30 min. Five trades is over.
        trades.push(held("2026-10-06T09:00:00Z", 40, -2.0));
        trades.push(held("2026-10-06T09:10:00Z", 5, -2.0));
        trades.push(held("2026-10-06T10:00:00Z", 60, -2.0));
        trades.push(held("2026-10-06T10:20:00Z", 3, -2.0));
        trades.push(held("2026-10-06T10:30:00Z", 3, -3.0));

        let o = analyze(&trades, &filters("UTC")).unwrap().overtrading;
        let best = o.best.as_ref().unwrap();
        assert_eq!(
            (best.key.as_str(), best.median_min, best.trades),
            ("15–60m", 30.0, 6)
        );
        assert_eq!(best.net, 48.0);
        assert_eq!(o.days.len(), 6);
        // One 30-minute trade: span 30 min, 1 allowed.
        assert_eq!((o.days[0].allowed, o.days[0].over), (Some(1), false));
        let busy = &o.days[5];
        assert_eq!(
            (
                busy.day.as_str(),
                busy.trades,
                busy.span_min,
                busy.allowed,
                busy.over
            ),
            ("2026-10-06", 5, 100.0, Some(3), true)
        );
        assert_eq!(busy.net, -11.0);
        assert_eq!((o.over.trades, o.over.net), (1, -11.0));
        assert_eq!((o.within.trades, o.within.net), (5, 50.0));
    }

    #[test]
    fn overtrading_without_a_winning_duration() {
        let trades: Vec<_> = (1..=5)
            .map(|d| held(&format!("2026-10-0{d}T09:00:00Z"), 30, -1.0))
            .collect();
        let o = analyze(&trades, &filters("UTC")).unwrap().overtrading;
        assert!(o.best.is_none());
        assert!(o.days.iter().all(|d| d.allowed.is_none() && !d.over));
    }
}
