//! Deposits and withdrawals: totals and a per-day timeline.

use std::collections::BTreeMap;

use chrono_tz::Tz;

use crate::stats::round2;
use crate::{CashDay, CashFlow, CashReport, CashSummary, FlowKind, FlowTotal};

pub fn report(flows: &[CashFlow], tz: Tz) -> CashReport {
    let total = |kind: FlowKind| {
        let amounts: Vec<f64> = flows
            .iter()
            .filter(|f| f.kind == kind)
            .map(|f| f.amount)
            .collect();
        FlowTotal {
            count: amounts.len() as u32,
            total: round2(amounts.iter().sum()),
        }
    };
    let deposits = total(FlowKind::Deposit);
    let withdrawals = total(FlowKind::Withdrawal);
    let net = round2(deposits.total - withdrawals.total);

    // yyyy-mm-dd sorts as text, so the map is in date order.
    let mut by_day: BTreeMap<String, (f64, f64)> = BTreeMap::new();
    for f in flows {
        let day = f.time.with_timezone(&tz).format("%Y-%m-%d").to_string();
        let (dep, wd) = by_day.entry(day).or_default();
        match f.kind {
            FlowKind::Deposit => *dep += f.amount,
            FlowKind::Withdrawal => *wd += f.amount,
        }
    }
    let mut cumulative = 0.0;
    let daily = by_day
        .into_iter()
        .map(|(day, (dep, wd))| {
            cumulative += dep - wd;
            CashDay {
                day,
                deposits: round2(dep),
                withdrawals: round2(wd),
                net: round2(dep - wd),
                cumulative: round2(cumulative),
            }
        })
        .collect();

    CashReport {
        summary: CashSummary {
            deposits,
            withdrawals,
            net,
        },
        daily,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flow(time: &str, kind: FlowKind, amount: f64) -> CashFlow {
        CashFlow {
            time: time.parse().unwrap(),
            kind,
            amount,
        }
    }

    #[test]
    fn empty() {
        let r = report(&[], Tz::UTC);
        assert_eq!(
            r.summary.deposits,
            FlowTotal {
                count: 0,
                total: 0.0
            }
        );
        assert_eq!(r.summary.net, 0.0);
        assert!(r.daily.is_empty());
    }

    #[test]
    fn totals_and_timeline() {
        use FlowKind::*;
        let flows = [
            // Out of order on purpose.
            flow("2026-09-10T08:00:00Z", Withdrawal, 150.0),
            flow("2026-08-01T09:00:00Z", Deposit, 500.0),
            flow("2026-08-01T20:00:00Z", Deposit, 0.1),
            flow("2026-08-01T21:00:00Z", Deposit, 0.2),
            flow("2026-09-10T09:00:00Z", Deposit, 50.0),
        ];
        let r = report(&flows, Tz::UTC);
        assert_eq!(
            r.summary.deposits,
            FlowTotal {
                count: 4,
                total: 550.3
            }
        );
        assert_eq!(
            r.summary.withdrawals,
            FlowTotal {
                count: 1,
                total: 150.0
            }
        );
        assert_eq!(r.summary.net, 400.3);
        assert_eq!(
            r.daily,
            vec![
                CashDay {
                    day: "2026-08-01".into(),
                    deposits: 500.3,
                    withdrawals: 0.0,
                    net: 500.3,
                    cumulative: 500.3,
                },
                CashDay {
                    day: "2026-09-10".into(),
                    deposits: 50.0,
                    withdrawals: 150.0,
                    net: -100.0,
                    cumulative: 400.3,
                },
            ]
        );
    }

    #[test]
    fn days_follow_the_timezone() {
        // 20:00 UTC is the next morning in Manila (UTC+8).
        let flows = [
            flow("2026-08-01T09:00:00Z", FlowKind::Deposit, 100.0),
            flow("2026-08-01T20:00:00Z", FlowKind::Deposit, 100.0),
        ];
        assert_eq!(report(&flows, Tz::UTC).daily.len(), 1);
        let manila: Vec<_> = report(&flows, "Asia/Manila".parse().unwrap())
            .daily
            .into_iter()
            .map(|d| d.day)
            .collect();
        assert_eq!(manila, ["2026-08-01", "2026-08-02"]);
    }
}
