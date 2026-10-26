//! Playbook: plan trades with numbers before taking them (`engine::playbook`).
//!
//! - `POST /api/accounts/:id/playbook/calc`: the calculator. Every plan.
//! - `GET /api/accounts/:id/playbook`: saved plans with their numbers, checks and results,
//!   plus the value per point of each symbol. Matches planned trades to imported ones first.
//! - `POST`, `PATCH /:plan`, `DELETE /:plan`: save, change, delete plans. Paid plans.
//! - `PUT`, `DELETE /api/accounts/:id/playbook/symbols/:symbol`: the user's value per point.

use std::collections::{BTreeMap, BTreeSet};

use axum::extract::{Path, State};
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use engine::playbook::{self, PlanInput, Planned, Size, SymbolValue};
use engine::today::TodayPlan;
use engine::{Side, Trade};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::accounts::owned_account;
use super::analytics::parse_tz;
use super::cash_flows::TzQuery;
use super::me::settings_of;
use crate::auth::UserId;
use crate::error::{ApiError, ApiResult};
use crate::extract::{Json, Query};
use crate::plan::Plan;
use crate::today::{self, Inputs};

const NOT_FOUND: ApiError = ApiError::NotFound("This planned trade does not exist.");
const MAX_NOTE: usize = 500;

fn paid_only() -> ApiError {
    ApiError::Forbidden(
        "Saving plans and comparing them with your trades is on Espresso and Latte. The calculator is free."
            .into(),
    )
}

#[derive(FromRow)]
struct Row {
    id: Uuid,
    symbol: String,
    side: String,
    entry: f64,
    stop_loss: f64,
    take_profit: Option<f64>,
    lots: f64,
    setup_id: Option<Uuid>,
    note: Option<String>,
    status: String,
    ticket: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

const COLUMNS: &str =
    "id, symbol, side, entry, stop_loss, take_profit, lots, setup_id, note, status, \
    ticket, created_at, updated_at";

fn side_of(s: &str) -> Side {
    if s == "sell" {
        Side::Sell
    } else {
        Side::Buy
    }
}

fn side_text(s: Side) -> &'static str {
    match s {
        Side::Buy => "buy",
        Side::Sell => "sell",
    }
}

impl Row {
    fn planned(&self) -> Planned {
        Planned {
            symbol: self.symbol.clone(),
            side: side_of(&self.side),
            entry: self.entry,
            stop_loss: self.stop_loss,
            take_profit: self.take_profit,
            lots: self.lots,
            created_at: self.created_at,
        }
    }
}

/// The value per point of every symbol the account traded, with the user's own values on top.
async fn symbol_values(
    pool: &PgPool,
    account: Uuid,
    trades: &[Trade],
) -> ApiResult<BTreeMap<String, SymbolValue>> {
    let mut out: BTreeMap<String, SymbolValue> = trades
        .iter()
        .map(|t| t.symbol.clone())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .map(|s| (s.clone(), playbook::symbol_value(trades, &s)))
        .collect();
    let own: Vec<(String, f64, f64)> = sqlx::query_as(
        "select symbol, point, value_per_point from symbol_values where account_id = $1",
    )
    .bind(account)
    .fetch_all(pool)
    .await?;
    for (symbol, point, value) in own {
        out.insert(
            symbol.clone(),
            SymbolValue {
                symbol,
                point,
                value_per_point: Some(value),
                trades: 0,
                source: Some("user".into()),
            },
        );
    }
    Ok(out)
}

fn value_for(values: &BTreeMap<String, SymbolValue>, symbol: &str, prices: &[f64]) -> SymbolValue {
    values
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(symbol))
        .map(|(_, v)| v.clone())
        .unwrap_or_else(|| SymbolValue {
            symbol: symbol.into(),
            point: playbook::point_of(prices.iter().copied()).unwrap_or(0.01),
            value_per_point: None,
            trades: 0,
            source: None,
        })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcInput {
    symbol: String,
    side: Side,
    entry: f64,
    stop_loss: f64,
    take_profit: Option<f64>,
    size: Size,
    tz: Option<String>,
}

struct Context {
    inputs: Inputs,
    values: BTreeMap<String, SymbolValue>,
    today: Option<TodayPlan>,
    balance: Option<f64>,
    min_rr: Option<f64>,
}

async fn context(pool: &PgPool, user: &str, account: Uuid, tz: String) -> ApiResult<Context> {
    parse_tz(&tz)?;
    let inputs = today::load(pool, user, account).await?;
    let values = symbol_values(pool, account, &inputs.trades).await?;
    let min_rr = settings_of(pool, user).await?.min_rr;
    let (inputs, today, balance) = tokio::task::spawn_blocking(move || {
        let plan = today::compute(&inputs, Utc::now(), &tz);
        let net: f64 = inputs.trades.iter().map(|t| t.net).sum();
        let balance = today::balance(&inputs.flows, net);
        (inputs, plan, balance)
    })
    .await
    .map_err(|e| ApiError::Internal(format!("engine crashed: {e}")))?;
    Ok(Context {
        inputs,
        values,
        today,
        balance,
        min_rr,
    })
}

fn calc_json(
    c: &Context,
    symbol: &str,
    side: Side,
    entry: f64,
    sl: f64,
    tp: Option<f64>,
    size: Size,
) -> Value {
    let value = value_for(&c.values, symbol, &[entry, sl]);
    let math = playbook::compute(&PlanInput {
        side,
        entry,
        stop_loss: sl,
        take_profit: tp,
        size,
        point: value.point,
        value_per_point: value.value_per_point,
        balance: c.balance,
    });
    let checks = playbook::checks(&math, c.today.as_ref(), c.min_rr);
    json!({ "math": math, "value": value, "checks": checks, "balance": c.balance })
}

pub async fn calc(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Json(b): Json<CalcInput>,
) -> ApiResult<Json<Value>> {
    let id = owned_account(&pool, &user, &id).await?;
    let c = context(&pool, &user, id, b.tz.unwrap_or_else(|| "UTC".into())).await?;
    Ok(Json(calc_json(
        &c,
        b.symbol.trim(),
        b.side,
        b.entry,
        b.stop_loss,
        b.take_profit,
        b.size,
    )))
}

/// Matches planned trades to imported ones and fills the review's starting stop and target
/// from the plan.
async fn match_trades(
    pool: &PgPool,
    account: Uuid,
    rows: &mut [Row],
    trades: &[Trade],
) -> ApiResult<()> {
    let mut taken: Vec<String> = rows.iter().filter_map(|r| r.ticket.clone()).collect();
    for r in rows
        .iter_mut()
        .filter(|r| r.ticket.is_none() && r.status != "skipped")
    {
        let Some(t) = playbook::find_match(&r.planned(), trades, &taken) else {
            continue;
        };
        let ticket = t.ticket.clone();
        let mut tx = pool.begin().await?;
        sqlx::query("update planned_trades set ticket = $2, status = 'taken', updated_at = now() where id = $1")
            .bind(r.id)
            .bind(&ticket)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "insert into trade_reviews (account_id, ticket, setup_id, initial_stop, initial_target)
             values ($1, $2, $3, $4, $5)
             on conflict (account_id, ticket) do update set
                setup_id = coalesce(trade_reviews.setup_id, excluded.setup_id),
                initial_stop = coalesce(trade_reviews.initial_stop, excluded.initial_stop),
                initial_target = coalesce(trade_reviews.initial_target, excluded.initial_target)",
        )
        .bind(account)
        .bind(&ticket)
        .bind(r.setup_id)
        .bind(r.stop_loss)
        .bind(r.take_profit)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        taken.push(ticket.clone());
        r.ticket = Some(ticket);
        r.status = "taken".into();
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlannedOut {
    id: Uuid,
    symbol: String,
    side: String,
    entry: f64,
    stop_loss: f64,
    take_profit: Option<f64>,
    lots: f64,
    setup_id: Option<Uuid>,
    note: Option<String>,
    status: String,
    ticket: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    math: playbook::PlanMath,
    result: Option<playbook::PlanResult>,
}

fn out(r: Row, c: &Context) -> PlannedOut {
    let value = value_for(&c.values, &r.symbol, &[r.entry, r.stop_loss]);
    let math = playbook::compute(&PlanInput {
        side: side_of(&r.side),
        entry: r.entry,
        stop_loss: r.stop_loss,
        take_profit: r.take_profit,
        size: Size::Lots(r.lots),
        point: value.point,
        value_per_point: value.value_per_point,
        balance: c.balance,
    });
    // A partly closed position can have several rows with the ticket; the first is enough.
    let result = r.ticket.as_ref().and_then(|tk| {
        c.inputs
            .trades
            .iter()
            .find(|t| &t.ticket == tk)
            .map(|t| playbook::compare(&r.planned(), t, value.point, math.risk))
    });
    PlannedOut {
        id: r.id,
        symbol: r.symbol,
        side: r.side,
        entry: r.entry,
        stop_loss: r.stop_loss,
        take_profit: r.take_profit,
        lots: r.lots,
        setup_id: r.setup_id,
        note: r.note,
        status: r.status,
        ticket: r.ticket,
        created_at: r.created_at,
        updated_at: r.updated_at,
        math,
        result,
    }
}

pub async fn list(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Query(q): Query<TzQuery>,
) -> ApiResult<Json<Value>> {
    let id = owned_account(&pool, &user, &id).await?;
    let c = context(&pool, &user, id, q.tz.unwrap_or_else(|| "UTC".into())).await?;
    let paid = Plan::of(&pool, &user).await?.is_paid();
    let mut rows: Vec<Row> = if paid {
        sqlx::query_as(&format!(
            "select {COLUMNS} from planned_trades where account_id = $1 order by created_at desc"
        ))
        .bind(id)
        .fetch_all(&pool)
        .await?
    } else {
        Vec::new()
    };
    match_trades(&pool, id, &mut rows, &c.inputs.trades).await?;
    let plans: Vec<PlannedOut> = rows.into_iter().map(|r| out(r, &c)).collect();
    // Most traded first, so the calculator starts on the usual symbol.
    let mut symbols: Vec<&SymbolValue> = c.values.values().collect();
    let count = |s: &str| c.inputs.trades.iter().filter(|t| t.symbol == s).count();
    symbols.sort_by_key(|v| std::cmp::Reverse(count(&v.symbol)));
    Ok(Json(json!({
        "plans": plans,
        "symbols": symbols,
        "balance": c.balance,
        "minRr": c.min_rr,
        "locked": !paid,
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewPlan {
    symbol: String,
    side: Side,
    entry: f64,
    stop_loss: f64,
    take_profit: Option<f64>,
    size: Size,
    setup_id: Option<Uuid>,
    note: Option<String>,
    tz: Option<String>,
}

fn clean_note(n: Option<String>) -> ApiResult<Option<String>> {
    let n = n.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    if n.as_ref().is_some_and(|s| s.chars().count() > MAX_NOTE) {
        return Err(ApiError::bad_request("Keep the note to 500 characters."));
    }
    Ok(n)
}

fn clean_symbol(s: &str) -> ApiResult<String> {
    let s = s.trim().to_uppercase();
    if s.is_empty() || s.len() > 32 {
        return Err(ApiError::bad_request("Enter the symbol, such as XAUUSD."));
    }
    Ok(s)
}

async fn check_setup(pool: &PgPool, user: &str, setup: Option<Uuid>) -> ApiResult<()> {
    if let Some(s) = setup {
        let mine: Option<Uuid> =
            sqlx::query_scalar("select id from setups where id = $1 and user_id = $2")
                .bind(s)
                .bind(user)
                .fetch_optional(pool)
                .await?;
        mine.ok_or_else(|| ApiError::bad_request("This setup does not exist."))?;
    }
    Ok(())
}

pub async fn create(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Json(b): Json<NewPlan>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let id = owned_account(&pool, &user, &id).await?;
    if !Plan::of(&pool, &user).await?.is_paid() {
        return Err(paid_only());
    }
    let symbol = clean_symbol(&b.symbol)?;
    let note = clean_note(b.note)?;
    check_setup(&pool, &user, b.setup_id).await?;
    let c = context(&pool, &user, id, b.tz.unwrap_or_else(|| "UTC".into())).await?;
    let calc = calc_json(
        &c,
        &symbol,
        b.side,
        b.entry,
        b.stop_loss,
        b.take_profit,
        b.size,
    );
    let math: playbook::PlanMath = serde_json::from_value(calc["math"].clone())
        .map_err(|e| ApiError::Internal(format!("plan math: {e}")))?;
    if let Some(e) = math.errors.first() {
        return Err(ApiError::bad_request(e.clone()));
    }
    let lots = math
        .lots
        .ok_or_else(|| ApiError::bad_request("Enter the lots."))?;
    let row: Row = sqlx::query_as(&format!(
        "insert into planned_trades (account_id, symbol, side, entry, stop_loss, take_profit, lots, setup_id, note)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning {COLUMNS}"
    ))
    .bind(id)
    .bind(&symbol)
    .bind(side_text(b.side))
    .bind(b.entry)
    .bind(b.stop_loss)
    .bind(b.take_profit)
    .bind(lots)
    .bind(b.setup_id)
    .bind(note)
    .fetch_one(&pool)
    .await?;
    let mut v = json!(out(row, &c));
    v["checks"] = calc["checks"].clone();
    Ok((StatusCode::CREATED, Json(v)))
}

async fn owned_plan(pool: &PgPool, account: Uuid, plan: &str) -> ApiResult<Uuid> {
    let plan: Uuid = plan.parse().map_err(|_| NOT_FOUND)?;
    let found: Option<Uuid> =
        sqlx::query_scalar("select id from planned_trades where id = $1 and account_id = $2")
            .bind(plan)
            .bind(account)
            .fetch_optional(pool)
            .await?;
    found.ok_or(NOT_FOUND)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlanPatch {
    /// "planned", "taken" or "skipped". Back to "planned" also clears the matched trade.
    status: Option<String>,
    #[serde(default, deserialize_with = "present")]
    note: Option<Option<String>>,
    #[serde(default, deserialize_with = "present")]
    setup_id: Option<Option<Uuid>>,
    tz: Option<String>,
}

fn present<'de, T: Deserialize<'de>, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Option<Option<T>>, D::Error> {
    Option::<T>::deserialize(d).map(Some)
}

pub async fn update(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path((id, plan)): Path<(String, String)>,
    Json(b): Json<PlanPatch>,
) -> ApiResult<Json<Value>> {
    let id = owned_account(&pool, &user, &id).await?;
    if !Plan::of(&pool, &user).await?.is_paid() {
        return Err(paid_only());
    }
    let plan = owned_plan(&pool, id, &plan).await?;
    if let Some(s) = &b.status {
        if !["planned", "taken", "skipped"].contains(&s.as_str()) {
            return Err(ApiError::bad_request(
                "Use planned, taken or skipped for \"status\".",
            ));
        }
    }
    let note = b.note.clone().map(clean_note).transpose()?;
    if let Some(s) = b.setup_id {
        check_setup(&pool, &user, s).await?;
    }
    let row: Row = sqlx::query_as(&format!(
        "update planned_trades set
            status = coalesce($2, status),
            ticket = case when $2 in ('planned', 'skipped') then null else ticket end,
            note = case when $3 then $4 else note end,
            setup_id = case when $5 then $6 else setup_id end,
            updated_at = now()
         where id = $1 returning {COLUMNS}"
    ))
    .bind(plan)
    .bind(&b.status)
    .bind(note.is_some())
    .bind(note.flatten())
    .bind(b.setup_id.is_some())
    .bind(b.setup_id.flatten())
    .fetch_one(&pool)
    .await?;
    let c = context(&pool, &user, id, b.tz.unwrap_or_else(|| "UTC".into())).await?;
    Ok(Json(json!(out(row, &c))))
}

pub async fn remove(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path((id, plan)): Path<(String, String)>,
) -> ApiResult<StatusCode> {
    let id = owned_account(&pool, &user, &id).await?;
    let plan = owned_plan(&pool, id, &plan).await?;
    sqlx::query("delete from planned_trades where id = $1")
        .bind(plan)
        .execute(&pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SymbolInput {
    point: f64,
    value_per_point: f64,
}

pub async fn set_symbol(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path((id, symbol)): Path<(String, String)>,
    Json(b): Json<SymbolInput>,
) -> ApiResult<Json<SymbolValue>> {
    let id = owned_account(&pool, &user, &id).await?;
    let symbol = clean_symbol(&symbol)?;
    let ok = |v: f64| v.is_finite() && v > 0.0 && v < 1e9;
    if !ok(b.point) || !ok(b.value_per_point) {
        return Err(ApiError::bad_request(
            "Enter a point size and a value per point above 0.",
        ));
    }
    sqlx::query(
        "insert into symbol_values (account_id, symbol, point, value_per_point) values ($1, $2, $3, $4)
         on conflict (account_id, symbol) do update set point = excluded.point,
            value_per_point = excluded.value_per_point",
    )
    .bind(id)
    .bind(&symbol)
    .bind(b.point)
    .bind(b.value_per_point)
    .execute(&pool)
    .await?;
    Ok(Json(SymbolValue {
        symbol,
        point: b.point,
        value_per_point: Some(b.value_per_point),
        trades: 0,
        source: Some("user".into()),
    }))
}

pub async fn clear_symbol(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path((id, symbol)): Path<(String, String)>,
) -> ApiResult<StatusCode> {
    let id = owned_account(&pool, &user, &id).await?;
    sqlx::query("delete from symbol_values where account_id = $1 and upper(symbol) = upper($2)")
        .bind(id)
        .bind(symbol.trim())
        .execute(&pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
