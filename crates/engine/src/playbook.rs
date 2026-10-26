//! Playbook: the math for a trade planned before it is taken.
//!
//! - A point is the smallest price step of the symbol (10^-digits), worked out from the prices
//!   in the account's trades. The value per point is the dollar value of one point for 1 lot.
//! - Risk and reward come from the distance to the stop loss and take profit in points, times
//!   lots, times the value per point.
//! - The checks compare the plan with today's plan (see [`crate::today`]).

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::stats::round2;
use crate::today::{money, num, TodayPlan};
use crate::{Side, Trade};

/// Largest number of decimals a price can have.
const MAX_DIGITS: i32 = 5;
/// Smallest position the broker takes, and the lot step.
const LOT_STEP: f64 = 0.01;

/// What one point is worth on a symbol.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SymbolValue {
    pub symbol: String,
    /// The smallest price step, e.g. 0.001 for XAUUSD on Exness.
    pub point: f64,
    /// Dollars per point per lot. None when there are no trades to work it out from.
    pub value_per_point: Option<f64>,
    /// The trades it was worked out from. 0 when entered by the user.
    pub trades: u32,
    /// "trades" (worked out) or "user" (entered).
    pub source: Option<String>,
}

/// Number of decimals in a price, up to 5.
fn digits(p: f64) -> i32 {
    (0..=MAX_DIGITS)
        .find(|d| {
            let x = p * 10f64.powi(*d);
            (x - x.round()).abs() < 1e-6 * x.abs().max(1.0)
        })
        .unwrap_or(MAX_DIGITS)
}

/// The point of a symbol from prices: the most decimals seen.
pub fn point_of(prices: impl IntoIterator<Item = f64>) -> Option<f64> {
    prices
        .into_iter()
        .filter(|p| p.is_finite() && *p > 0.0)
        .map(digits)
        .max()
        .map(|d| 10f64.powi(-d))
}

/// The value of one point per lot on `symbol`, from the account's trades: the median of
/// |profit| ÷ (points moved × lots) over the trades that moved and made or lost money.
pub fn symbol_value(trades: &[Trade], symbol: &str) -> SymbolValue {
    let on: Vec<&Trade> = trades.iter().filter(|t| t.symbol == symbol).collect();
    let point = point_of(on.iter().flat_map(|t| [t.open_price, t.close_price])).unwrap_or(0.01);
    let mut values: Vec<f64> = on
        .iter()
        .filter_map(|t| {
            let points = (t.close_price - t.open_price).abs() / point;
            (points >= 1.0 && t.lots > 0.0 && t.profit != 0.0)
                .then(|| t.profit.abs() / (points * t.lots))
        })
        .collect();
    values.sort_by(f64::total_cmp);
    let median = match values.len() {
        0 => None,
        n if n % 2 == 1 => Some(values[n / 2]),
        n => Some((values[n / 2 - 1] + values[n / 2]) / 2.0),
    };
    SymbolValue {
        symbol: symbol.into(),
        point,
        value_per_point: median.map(|v| (v * 1e6).round() / 1e6),
        trades: values.len() as u32,
        source: median.map(|_| "trades".into()),
    }
}

/// How the size is given: lots, a dollar risk, or a % of the balance.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "by", content = "value")]
pub enum Size {
    Lots(f64),
    Risk(f64),
    Percent(f64),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanInput {
    pub side: Side,
    pub entry: f64,
    pub stop_loss: f64,
    pub take_profit: Option<f64>,
    pub size: Size,
    pub point: f64,
    pub value_per_point: Option<f64>,
    /// The account balance. None without deposits.
    pub balance: Option<f64>,
}

/// The numbers of a planned trade. Money values need the value per point.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanMath {
    pub lots: Option<f64>,
    pub sl_points: f64,
    pub tp_points: Option<f64>,
    /// Dollars lost at the stop loss.
    pub risk: Option<f64>,
    /// Dollars made at the take profit.
    pub reward: Option<f64>,
    /// Reward ÷ risk, from the distances (no value per point needed).
    pub rr: Option<f64>,
    /// Risk as a % of the balance.
    pub risk_percent: Option<f64>,
    /// Why the plan cannot be worked out. Empty when it can.
    pub errors: Vec<String>,
}

/// Rounds lots down to the lot step.
fn round_lots(l: f64) -> f64 {
    ((l / LOT_STEP) + 1e-9).floor() * LOT_STEP
}

pub fn compute(i: &PlanInput) -> PlanMath {
    let mut errors = Vec::new();
    let buy = i.side == Side::Buy;
    if !(i.entry > 0.0 && i.entry.is_finite()) {
        errors.push("Enter the entry price.".to_string());
    }
    if !(i.stop_loss > 0.0 && i.stop_loss.is_finite()) {
        errors.push("Enter the stop loss.".to_string());
    } else if (buy && i.stop_loss >= i.entry) || (!buy && i.stop_loss <= i.entry) {
        errors.push(format!(
            "For a {}, the stop loss must be {} the entry.",
            if buy { "buy" } else { "sell" },
            if buy { "below" } else { "above" }
        ));
    }
    if let Some(tp) = i.take_profit {
        if (buy && tp <= i.entry) || (!buy && tp >= i.entry) {
            errors.push(format!(
                "For a {}, the take profit must be {} the entry.",
                if buy { "buy" } else { "sell" },
                if buy { "above" } else { "below" }
            ));
        }
    }
    let point = if i.point > 0.0 { i.point } else { 0.01 };
    let sl_points = ((i.entry - i.stop_loss).abs() / point).round();
    let tp_points = i
        .take_profit
        .map(|tp| ((tp - i.entry).abs() / point).round());
    let vpp = i.value_per_point.filter(|v| *v > 0.0);
    let bal = i.balance.filter(|b| *b > 0.0);
    let lots = match i.size {
        Size::Lots(l) if l > 0.0 => Some(l),
        Size::Lots(_) => {
            errors.push("Enter the lots.".into());
            None
        }
        Size::Risk(r) | Size::Percent(r) if r <= 0.0 => {
            errors.push("Enter a risk above 0.".into());
            None
        }
        Size::Risk(_) | Size::Percent(_) if vpp.is_none() => {
            errors.push("Enter the value per point to work out the lots.".into());
            None
        }
        Size::Percent(_) if bal.is_none() => {
            errors.push("Add your deposits in Funding to size by % of the balance.".into());
            None
        }
        Size::Risk(r) | Size::Percent(r) if errors.is_empty() && sl_points > 0.0 => {
            let dollars = if let Size::Percent(_) = i.size {
                bal.unwrap_or(0.0) * r / 100.0
            } else {
                r
            };
            let l = round_lots(dollars / (sl_points * vpp.unwrap_or(1.0)));
            if l < LOT_STEP {
                errors.push(format!(
                    "{} is too small for this stop. The smallest size, 0.01 lots, risks {}.",
                    money(dollars, false),
                    money(sl_points * vpp.unwrap_or(0.0) * LOT_STEP, false)
                ));
                None
            } else {
                Some((l * 100.0).round() / 100.0)
            }
        }
        _ => None,
    };
    let ok = errors.is_empty();
    let risk = match (ok, lots, vpp) {
        (true, Some(l), Some(v)) => Some(round2(sl_points * l * v)),
        _ => None,
    };
    let reward = match (ok, lots, vpp, tp_points) {
        (true, Some(l), Some(v), Some(tp)) => Some(round2(tp * l * v)),
        _ => None,
    };
    PlanMath {
        lots,
        sl_points,
        tp_points,
        risk,
        reward,
        rr: match (ok, tp_points) {
            (true, Some(tp)) if sl_points > 0.0 => Some((tp / sl_points * 100.0).round() / 100.0),
            _ => None,
        },
        risk_percent: match (risk, bal) {
            (Some(r), Some(b)) => Some((r / b * 10_000.0).round() / 100.0),
            _ => None,
        },
        errors,
    }
}

/// A warning: the plan breaks one of today's rules.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    /// "trades", "lossLimit", "perTrade", "hour", "rest", "rr"
    pub rule: String,
    pub text: String,
}

/// The rules of today's plan that this trade breaks. `min_rr`: the user's minimum R:R.
pub fn checks(m: &PlanMath, today: Option<&TodayPlan>, min_rr: Option<f64>) -> Vec<Check> {
    let mut out = Vec::new();
    let mut add = |rule: &str, text: String| {
        out.push(Check {
            rule: rule.into(),
            text,
        })
    };
    if let Some(t) = today {
        if t.rest {
            add("rest", format!("{} {}", t.verdict.label, t.verdict.why));
        } else if t.left == Some(0) {
            add("trades", format!("No trades left today. {}", t.verdict.why));
        }
        if let (Some(risk), Some(daily)) = (m.risk, t.limits.daily) {
            let room = round2(daily + t.day_net.min(0.0)).max(0.0);
            if risk > room {
                add(
                    "lossLimit",
                    format!(
                        "Risk {} is more than the {} left before your daily loss limit.",
                        money(risk, false),
                        money(room, false)
                    ),
                );
            }
        }
        if let (Some(risk), Some(per)) = (m.risk, t.limits.per_trade) {
            if risk > per {
                add(
                    "perTrade",
                    format!(
                        "Risk {} is more than your {} a trade.",
                        money(risk, false),
                        money(per, false)
                    ),
                );
            }
        }
        if t.skip_hours.contains(&t.hour) {
            add(
                "hour",
                format!(
                    "It is {}. Your plan skips this hour.",
                    crate::today::hour_label(t.hour)
                ),
            );
        }
    }
    if let (Some(rr), Some(min)) = (m.rr, min_rr) {
        if rr < min {
            add(
                "rr",
                format!("R:R {} is below your minimum of {}.", num(rr), num(min)),
            );
        }
    }
    out
}

/// What a planned trade looks like to [`find_match`] and [`compare`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Planned {
    pub symbol: String,
    pub side: Side,
    pub entry: f64,
    pub stop_loss: f64,
    pub take_profit: Option<f64>,
    pub lots: f64,
    pub created_at: DateTime<Utc>,
}

/// The trade a plan became: same symbol and side, opened from 1 hour before the plan was made
/// to 24 hours after, the open price nearest the planned entry. `taken`: tickets already
/// matched to other plans.
pub fn find_match<'a>(p: &Planned, trades: &'a [Trade], taken: &[String]) -> Option<&'a Trade> {
    let from = p.created_at - Duration::hours(1);
    let to = p.created_at + Duration::hours(24);
    trades
        .iter()
        .filter(|t| {
            t.symbol.eq_ignore_ascii_case(&p.symbol)
                && t.side == p.side
                && t.open >= from
                && t.open <= to
                && !taken.contains(&t.ticket)
        })
        .min_by(|a, b| {
            (a.open_price - p.entry)
                .abs()
                .total_cmp(&(b.open_price - p.entry).abs())
        })
}

/// Plan against result.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanResult {
    pub ticket: String,
    pub open: DateTime<Utc>,
    pub open_price: f64,
    pub close_price: f64,
    pub lots: f64,
    pub net: f64,
    /// Points the entry was worse (+) or better (−) than planned.
    pub slippage_points: f64,
    /// The trade's last stop loss and take profit, when they differ from the plan.
    pub sl_moved: Option<f64>,
    pub tp_moved: Option<f64>,
    pub lots_changed: bool,
    /// The result in R: net ÷ the planned risk.
    pub r: Option<f64>,
}

pub fn compare(p: &Planned, t: &Trade, point: f64, planned_risk: Option<f64>) -> PlanResult {
    let point = if point > 0.0 { point } else { 0.01 };
    let worse = match p.side {
        Side::Buy => t.open_price - p.entry,
        Side::Sell => p.entry - t.open_price,
    };
    let moved = |actual: Option<f64>, planned: Option<f64>| match (actual, planned) {
        (Some(a), Some(b)) if (a - b).abs() >= point / 2.0 => Some(a),
        (Some(a), None) => Some(a),
        _ => None,
    };
    PlanResult {
        ticket: t.ticket.clone(),
        open: t.open,
        open_price: t.open_price,
        close_price: t.close_price,
        lots: t.lots,
        net: t.net,
        slippage_points: (worse / point).round(),
        sl_moved: moved(t.sl, Some(p.stop_loss)),
        tp_moved: moved(t.tp, p.take_profit),
        lots_changed: (t.lots - p.lots).abs() > 1e-9,
        r: planned_risk
            .filter(|r| *r > 0.0)
            .map(|r| (t.net / r * 100.0).round() / 100.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn trade(symbol: &str, side: Side, open: f64, close: f64, lots: f64, profit: f64) -> Trade {
        Trade {
            ticket: format!("{symbol}{open}"),
            open: Utc.with_ymd_and_hms(2026, 10, 1, 10, 0, 0).unwrap(),
            close: Utc.with_ymd_and_hms(2026, 10, 1, 11, 0, 0).unwrap(),
            side,
            lots,
            symbol: symbol.into(),
            open_price: open,
            close_price: close,
            sl: None,
            tp: None,
            commission: 0.0,
            swap: 0.0,
            profit,
            net: profit,
            reason: "user".into(),
        }
    }

    #[test]
    fn point_and_value_from_trades() {
        // XAUUSD with 3 decimals: 0.01 lots moving 2.000 (2000 points) made $2, so $0.10 a point a lot.
        let ts = [
            trade("XAUUSD", Side::Buy, 2650.125, 2652.125, 0.01, 2.0),
            trade("XAUUSD", Side::Sell, 2660.5, 2661.5, 0.1, -10.0),
            trade("EURUSD", Side::Buy, 1.0801, 1.0811, 1.0, 100.0),
        ];
        let v = symbol_value(&ts, "XAUUSD");
        assert!((v.point - 0.001).abs() < 1e-12);
        assert_eq!(v.value_per_point, Some(0.1));
        assert_eq!(v.trades, 2);
        let e = symbol_value(&ts, "EURUSD");
        assert!((e.point - 0.0001).abs() < 1e-12);
        assert_eq!(e.value_per_point, Some(10.0));
        let none = symbol_value(&ts, "BTCUSD");
        assert_eq!(none.value_per_point, None);
    }

    fn input(size: Size) -> PlanInput {
        PlanInput {
            side: Side::Buy,
            entry: 2650.0,
            stop_loss: 2645.0,
            take_profit: Some(2665.0),
            size,
            point: 0.01,
            value_per_point: Some(1.0),
            balance: Some(1000.0),
        }
    }

    #[test]
    fn risk_reward_and_lots_from_risk() {
        let m = compute(&input(Size::Lots(0.02)));
        assert!(m.errors.is_empty());
        assert_eq!(m.sl_points, 500.0);
        assert_eq!(m.tp_points, Some(1500.0));
        assert_eq!(m.risk, Some(10.0));
        assert_eq!(m.reward, Some(30.0));
        assert_eq!(m.rr, Some(3.0));
        assert_eq!(m.risk_percent, Some(1.0));

        // $12 at 500 points × $1 → 0.024 lots, rounded down to 0.02.
        assert_eq!(compute(&input(Size::Risk(12.0))).lots, Some(0.02));
        // 2% of $1000 = $20 → 0.04 lots.
        assert_eq!(compute(&input(Size::Percent(2.0))).lots, Some(0.04));
        // Too small for the stop.
        let small = compute(&input(Size::Risk(1.0)));
        assert_eq!(small.lots, None);
        assert_eq!(small.errors.len(), 1);
    }

    #[test]
    fn wrong_side_stop_is_an_error() {
        let mut i = input(Size::Lots(0.01));
        i.stop_loss = 2655.0;
        assert_eq!(
            compute(&i).errors,
            ["For a buy, the stop loss must be below the entry."]
        );
        i.side = Side::Sell;
        i.take_profit = Some(2640.0);
        assert!(compute(&i).errors.is_empty());
    }

    #[test]
    fn match_and_compare() {
        let made = Utc.with_ymd_and_hms(2026, 10, 1, 9, 30, 0).unwrap();
        let p = Planned {
            symbol: "XAUUSD".into(),
            side: Side::Buy,
            entry: 2650.0,
            stop_loss: 2645.0,
            take_profit: Some(2665.0),
            lots: 0.02,
            created_at: made,
        };
        let mut a = trade("XAUUSD", Side::Buy, 2650.4, 2660.0, 0.03, 28.8);
        a.sl = Some(2648.0);
        a.tp = Some(2665.0);
        let b = trade("XAUUSD", Side::Buy, 2655.0, 2660.0, 0.02, 10.0);
        let c = trade("XAUUSD", Side::Sell, 2650.0, 2640.0, 0.02, 20.0);
        let ts = [b, a.clone(), c];
        let m = find_match(&p, &ts, &[]).unwrap();
        assert_eq!(m.ticket, a.ticket);
        assert!(find_match(&p, &ts, &[a.ticket.clone(), ts[0].ticket.clone()]).is_none());

        let r = compare(&p, &a, 0.01, Some(10.0));
        assert_eq!(r.slippage_points, 40.0);
        assert_eq!(r.sl_moved, Some(2648.0));
        assert_eq!(r.tp_moved, None);
        assert!(r.lots_changed);
        assert_eq!(r.r, Some(2.88));
    }
}
