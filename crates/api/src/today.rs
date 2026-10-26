//! Today's plan for a trading account (`engine::today`), with the inputs loaded from the
//! database. Used by the Today card route, the playbook checks and the reminder email.

use chrono::{DateTime, Utc};
use engine::today::{AccountRisk, TodayPlan};
use engine::{CashFlow, Filters, FlowKind, Trade};
use sqlx::types::Json as Jsonb;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::{ApiError, ApiResult};
use crate::plan::Plan;
use crate::trade_row::load_trades;

/// Everything the plan needs, loaded once.
pub struct Inputs {
    pub trades: Vec<Trade>,
    pub flows: Vec<CashFlow>,
    pub risk: AccountRisk,
    pub locked: bool,
}

pub async fn load(pool: &PgPool, user: &str, account: Uuid) -> ApiResult<Inputs> {
    let trades = load_trades(pool, account).await?;
    let rows: Vec<(String, f64, bool, DateTime<Utc>)> = sqlx::query_as(
        "select kind, amount, internal, occurred_at from cash_flows where account_id = $1",
    )
    .bind(account)
    .fetch_all(pool)
    .await?;
    let flows = rows
        .into_iter()
        .map(|(kind, amount, internal, time)| CashFlow {
            time,
            kind: match kind.as_str() {
                "withdrawal" => FlowKind::Withdrawal,
                "adjustment" => FlowKind::Adjustment,
                _ => FlowKind::Deposit,
            },
            amount,
            internal,
        })
        .collect();
    let risk: Option<Jsonb<serde_json::Value>> =
        sqlx::query_scalar("select risk from trading_accounts where id = $1")
            .bind(account)
            .fetch_one(pool)
            .await?;
    let risk = risk
        .and_then(|r| serde_json::from_value(r.0).ok())
        .unwrap_or_default();
    let locked = !Plan::of(pool, user).await?.is_paid();
    Ok(Inputs {
        trades,
        flows,
        risk,
        locked,
    })
}

/// Net deposited + broker adjustments + net P&L of all closed trades. None without any cash
/// flow: trading P&L alone is not a balance.
pub fn balance(flows: &[CashFlow], trading_net: f64) -> Option<f64> {
    if flows.is_empty() {
        return None;
    }
    let s = engine::cash_report(flows, "UTC").summary;
    Some(s.net + s.adjustments.total + trading_net)
}

/// The plan, or None when the account has no trades. CPU work, run it off the async threads.
pub fn compute(i: &Inputs, now: DateTime<Utc>, tz: &str) -> Option<TodayPlan> {
    let filters = Filters {
        range_days: None,
        symbol: None,
        side: None,
        tz: tz.into(),
    };
    let a = engine::analyze(&i.trades, &filters)?;
    let balance = balance(&i.flows, a.summary.group.net);
    Some(engine::today::today_plan(
        &a, i.locked, now, tz, balance, &i.risk,
    ))
}

/// Loads and computes, off the async threads.
pub async fn plan_for(
    pool: &PgPool,
    user: &str,
    account: Uuid,
    tz: String,
) -> ApiResult<Option<TodayPlan>> {
    let inputs = load(pool, user, account).await?;
    tokio::task::spawn_blocking(move || compute(&inputs, Utc::now(), &tz))
        .await
        .map_err(|e| ApiError::Internal(format!("engine crashed: {e}")))
}
