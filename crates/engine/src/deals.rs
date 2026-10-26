//! Broker deals (the Exness Trader API history) into trades and cash flows.
//!
//! The same rules as the MT5 report import ([`crate::mt5`]), so a sync and a report give the
//! same rows:
//!
//! - One [`Trade`] per position, once it is fully closed (closed volume ≥ opened volume). The
//!   ticket is the position id, which is also the MT5 report's position ticket. Open price and
//!   close price are volume-weighted over the opening and closing deals; profit is the sum of the
//!   closing deals, commission the sum over all its deals, swap the sum of its `swap_fee` deals.
//! - Close reason: the order behind the last closing deal (`sl`, `tp`, `so`), else "user".
//! - Stop loss and take profit: the last order of the position that has them.
//! - `balance` deals are deposits (money in) or withdrawals (money out). `null_compensation`
//!   (the negative balance reset after a stop out) is a broker adjustment. The API sends no deal
//!   comment, so internal transfers cannot be told apart and are not flagged.
//! - Other deal types (`admin_fee`, `dividend`, `exness_dollar`, `swap_fee` without a
//!   position) are counted in `skipped`.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::mt5::Mt5CashFlow;
use crate::stats::round2;
use crate::{FlowKind, Side, Trade};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerDeal {
    pub id: String,
    /// The API's deal type: "open", "close", "balance", "null_compensation", "swap_fee", ...
    pub kind: String,
    pub time: DateTime<Utc>,
    pub order_id: Option<String>,
    pub position_id: Option<String>,
    pub side: Option<Side>,
    pub symbol: Option<String>,
    pub volume: Option<f64>,
    pub price: Option<f64>,
    pub profit: Option<f64>,
    pub commission: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerOrder {
    pub id: String,
    pub time: DateTime<Utc>,
    pub position_id: Option<String>,
    /// The API's order reason: "sl", "tp", "so", "undefined", ...
    pub reason: Option<String>,
    pub stop_loss: Option<f64>,
    pub take_profit: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DealsReport {
    /// One per closed position, sorted by open time.
    pub trades: Vec<Trade>,
    /// Sorted by time. `deal` is the deal id.
    pub cash_flows: Vec<Mt5CashFlow>,
    /// Positions still open (not imported yet).
    pub open_positions: u32,
    /// Closed positions whose opening deal is older than the history the API returns.
    pub missing_open: u32,
    /// Deals that are not imported, counted by type.
    pub skipped: BTreeMap<String, u32>,
}

#[derive(Default)]
struct Pos<'a> {
    opens: Vec<&'a BrokerDeal>,
    closes: Vec<&'a BrokerDeal>,
    commission: f64,
    swap: f64,
}

/// Volume-weighted price of some deals.
fn avg_price(deals: &[&BrokerDeal]) -> f64 {
    let (pv, v) = deals.iter().fold((0.0, 0.0), |(pv, v), d| {
        let vol = d.volume.unwrap_or(0.0);
        (pv + d.price.unwrap_or(0.0) * vol, v + vol)
    });
    if v > 0.0 {
        pv / v
    } else {
        deals.last().and_then(|d| d.price).unwrap_or(0.0)
    }
}

fn volume(deals: &[&BrokerDeal]) -> f64 {
    deals.iter().map(|d| d.volume.unwrap_or(0.0)).sum()
}

pub fn build(deals: &[BrokerDeal], orders: &[BrokerOrder]) -> DealsReport {
    let mut sorted: Vec<&BrokerDeal> = deals.iter().collect();
    sorted.sort_by(|a, b| a.time.cmp(&b.time).then(a.id.cmp(&b.id)));
    let order_by_id: BTreeMap<&str, &BrokerOrder> =
        orders.iter().map(|o| (o.id.as_str(), o)).collect();

    let mut positions: BTreeMap<&str, Pos> = BTreeMap::new();
    let mut cash_flows = Vec::new();
    let mut skipped: BTreeMap<String, u32> = BTreeMap::new();
    let mut skip = |kind: &str| *skipped.entry(kind.to_string()).or_default() += 1;
    for d in &sorted {
        let pos = d.position_id.as_deref().filter(|p| !p.is_empty());
        match (d.kind.as_str(), pos) {
            ("open", Some(p)) => {
                let e = positions.entry(p).or_default();
                e.opens.push(d);
                e.commission += d.commission.unwrap_or(0.0);
            }
            ("close", Some(p)) => {
                let e = positions.entry(p).or_default();
                e.closes.push(d);
                e.commission += d.commission.unwrap_or(0.0);
            }
            ("swap_fee", Some(p)) => {
                positions.entry(p).or_default().swap += d.profit.unwrap_or(0.0);
            }
            ("balance", _) => match d.profit.filter(|a| *a != 0.0) {
                Some(amount) => cash_flows.push(Mt5CashFlow {
                    deal: d.id.clone(),
                    time: d.time,
                    kind: if amount < 0.0 {
                        FlowKind::Withdrawal
                    } else {
                        FlowKind::Deposit
                    },
                    amount: round2(amount.abs()),
                    comment: String::new(),
                    note: String::new(),
                    internal: false,
                }),
                None => skip("balance"),
            },
            ("null_compensation", _) => match d.profit.filter(|a| *a > 0.0) {
                Some(amount) => cash_flows.push(Mt5CashFlow {
                    deal: d.id.clone(),
                    time: d.time,
                    kind: FlowKind::Adjustment,
                    amount: round2(amount),
                    comment: String::new(),
                    note: "Negative balance reset (broker)".into(),
                    internal: false,
                }),
                None => skip("null_compensation"),
            },
            (kind, _) => skip(kind),
        }
    }

    // The position's last stop loss and take profit, from its orders in time order.
    let mut stops: BTreeMap<&str, (Option<f64>, Option<f64>)> = BTreeMap::new();
    let mut by_time: Vec<&BrokerOrder> = orders.iter().collect();
    by_time.sort_by(|a, b| a.time.cmp(&b.time).then(a.id.cmp(&b.id)));
    for o in by_time {
        if let Some(p) = o.position_id.as_deref() {
            let e = stops.entry(p).or_default();
            if o.stop_loss.is_some_and(|v| v > 0.0) {
                e.0 = o.stop_loss;
            }
            if o.take_profit.is_some_and(|v| v > 0.0) {
                e.1 = o.take_profit;
            }
        }
    }

    let mut trades = Vec::new();
    let (mut open_positions, mut missing_open) = (0, 0);
    for (id, p) in &positions {
        let (opened, closed) = (volume(&p.opens), volume(&p.closes));
        if p.closes.is_empty() || closed + 1e-9 < opened {
            open_positions += 1;
            continue;
        }
        if p.opens.is_empty() {
            missing_open += 1;
            continue;
        }
        let first = p.opens[0];
        let last = p.closes[p.closes.len() - 1];
        let side = first
            .side
            .or(last.side.map(|s| match s {
                Side::Buy => Side::Sell,
                Side::Sell => Side::Buy,
            }))
            .unwrap_or(Side::Buy);
        let reason = last
            .order_id
            .as_deref()
            .and_then(|o| order_by_id.get(o))
            .and_then(|o| o.reason.as_deref())
            .map(|r| match r {
                "sl" | "tp" | "so" => r,
                _ => "user",
            })
            .unwrap_or("user");
        let profit: f64 = p.closes.iter().map(|d| d.profit.unwrap_or(0.0)).sum();
        let (sl, tp) = stops.get(id).copied().unwrap_or_default();
        let (commission, swap, profit) = (round2(p.commission), round2(p.swap), round2(profit));
        trades.push(Trade {
            ticket: id.to_string(),
            open: first.time,
            close: last.time,
            side,
            lots: (opened * 100.0).round() / 100.0,
            symbol: first
                .symbol
                .clone()
                .or(last.symbol.clone())
                .unwrap_or_default(),
            open_price: round_price(avg_price(&p.opens)),
            close_price: round_price(avg_price(&p.closes)),
            sl,
            tp,
            commission,
            swap,
            profit,
            net: round2(profit + commission + swap),
            reason: reason.into(),
        });
    }
    trades.sort_by_key(|t| t.open);
    cash_flows.sort_by_key(|f| f.time);
    DealsReport {
        trades,
        cash_flows,
        open_positions,
        missing_open,
        skipped,
    }
}

/// Averages of several deals get long tails; keep 6 decimals.
fn round_price(p: f64) -> f64 {
    (p * 1e6).round() / 1e6
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn t(min: i64) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 10, 1, 10, 0, 0).unwrap() + chrono::Duration::minutes(min)
    }

    #[allow(clippy::too_many_arguments)]
    fn deal(
        id: &str,
        kind: &str,
        min: i64,
        pos: Option<&str>,
        side: Option<Side>,
        vol: f64,
        price: f64,
        profit: f64,
    ) -> BrokerDeal {
        BrokerDeal {
            id: id.into(),
            kind: kind.into(),
            time: t(min),
            order_id: Some(format!("o{id}")),
            position_id: pos.map(Into::into),
            side,
            symbol: pos.map(|_| "XAUUSD".into()),
            volume: (vol > 0.0).then_some(vol),
            price: (price > 0.0).then_some(price),
            profit: Some(profit),
            commission: Some(-0.1),
        }
    }

    #[test]
    fn positions_cash_and_reasons() {
        let deals = [
            deal("1", "balance", 0, None, None, 0.0, 0.0, 500.0),
            deal(
                "2",
                "open",
                5,
                Some("P1"),
                Some(Side::Buy),
                0.02,
                2650.0,
                0.0,
            ),
            deal(
                "3",
                "close",
                20,
                Some("P1"),
                Some(Side::Sell),
                0.01,
                2655.0,
                5.0,
            ),
            deal(
                "4",
                "close",
                30,
                Some("P1"),
                Some(Side::Sell),
                0.01,
                2645.0,
                -5.0,
            ),
            deal("5", "swap_fee", 31, Some("P1"), None, 0.0, 0.0, -0.4),
            deal(
                "6",
                "open",
                40,
                Some("P2"),
                Some(Side::Sell),
                0.05,
                2660.0,
                0.0,
            ),
            deal(
                "7",
                "close",
                50,
                Some("P3"),
                Some(Side::Buy),
                0.01,
                2600.0,
                3.0,
            ),
            deal("8", "balance", 60, None, None, 0.0, 0.0, -120.0),
            deal("9", "null_compensation", 61, None, None, 0.0, 0.0, 7.5),
            deal("10", "dividend", 62, None, None, 0.0, 0.0, 1.0),
        ];
        let orders = [
            BrokerOrder {
                id: "o2".into(),
                time: t(5),
                position_id: Some("P1".into()),
                reason: None,
                stop_loss: Some(2640.0),
                take_profit: None,
            },
            BrokerOrder {
                id: "o4".into(),
                time: t(30),
                position_id: Some("P1".into()),
                reason: Some("sl".into()),
                stop_loss: Some(2645.0),
                take_profit: None,
            },
        ];
        let r = build(&deals, &orders);
        assert_eq!(r.trades.len(), 1);
        let p = &r.trades[0];
        assert_eq!(p.ticket, "P1");
        assert_eq!(p.side, Side::Buy);
        assert_eq!(p.lots, 0.02);
        assert_eq!(p.open, t(5));
        assert_eq!(p.close, t(30));
        assert_eq!(p.close_price, 2650.0);
        assert_eq!(p.profit, 0.0);
        assert_eq!(p.commission, -0.3);
        assert_eq!(p.swap, -0.4);
        assert_eq!(p.net, -0.7);
        assert_eq!(p.reason, "sl");
        assert_eq!(p.sl, Some(2645.0));
        assert_eq!(r.open_positions, 1);
        assert_eq!(r.missing_open, 1);
        let kinds: Vec<_> = r.cash_flows.iter().map(|f| (f.kind, f.amount)).collect();
        assert_eq!(
            kinds,
            [
                (FlowKind::Deposit, 500.0),
                (FlowKind::Withdrawal, 120.0),
                (FlowKind::Adjustment, 7.5)
            ]
        );
        assert_eq!(r.skipped.get("dividend"), Some(&1));
    }
}
