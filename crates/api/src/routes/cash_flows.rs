//! Deposits and withdrawals: list with totals, add, delete. The user enters them by hand.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use engine::FlowKind;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::accounts::owned_account;
use super::analytics::parse_tz;
use crate::auth::UserId;
use crate::error::{ApiError, ApiResult};
use crate::extract::{Json, Query};

const NOT_FOUND: ApiError = ApiError::NotFound("This deposit or withdrawal does not exist.");
const MAX_NOTE: usize = 200;

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CashFlow {
    id: Uuid,
    occurred_at: DateTime<Utc>,
    kind: String,
    amount: f64,
    note: Option<String>,
    created_at: DateTime<Utc>,
}

const COLUMNS: &str = "id, occurred_at, kind, amount, note, created_at";

#[derive(Deserialize)]
pub struct TzQuery {
    pub tz: Option<String>,
}

/// `{ rows, summary, daily }`: the entries newest first, each with its `day` in `tz`,
/// plus the totals and per-day timeline from the engine.
pub async fn list(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Query(q): Query<TzQuery>,
) -> ApiResult<Json<Value>> {
    let tz =
        q.tz.filter(|t| !t.is_empty())
            .unwrap_or_else(|| "UTC".into());
    parse_tz(&tz)?;
    let id = owned_account(&pool, &user, &id).await?;
    let rows: Vec<CashFlow> = sqlx::query_as(&format!(
        "select {COLUMNS} from cash_flows where account_id = $1
         order by occurred_at desc, created_at desc"
    ))
    .bind(id)
    .fetch_all(&pool)
    .await?;

    let flows: Vec<engine::CashFlow> = rows
        .iter()
        .map(|r| engine::CashFlow {
            time: r.occurred_at,
            kind: kind_of(&r.kind),
            amount: r.amount,
        })
        .collect();
    let report = engine::cash_report(&flows, &tz);
    let rows: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            let day = engine::local_day(r.occurred_at, &tz);
            let mut v = json!(r);
            v["day"] = json!(day);
            v
        })
        .collect();
    Ok(Json(json!({
        "rows": rows,
        "summary": report.summary,
        "daily": report.daily,
    })))
}

fn kind_of(kind: &str) -> FlowKind {
    if kind == "withdrawal" {
        FlowKind::Withdrawal
    } else {
        FlowKind::Deposit
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewCashFlow {
    occurred_at: DateTime<Utc>,
    kind: String,
    amount: f64,
    note: Option<String>,
}

pub async fn create(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Json(body): Json<NewCashFlow>,
) -> ApiResult<Json<CashFlow>> {
    let id = owned_account(&pool, &user, &id).await?;
    if body.kind != "deposit" && body.kind != "withdrawal" {
        return Err(ApiError::bad_request(
            "Use deposit or withdrawal for \"kind\".",
        ));
    }
    if !body.amount.is_finite() || body.amount <= 0.0 {
        return Err(ApiError::bad_request("The amount must be more than zero."));
    }
    let note = body
        .note
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty());
    if note.as_ref().is_some_and(|n| n.chars().count() > MAX_NOTE) {
        return Err(ApiError::bad_request(format!(
            "Keep the note under {MAX_NOTE} characters."
        )));
    }
    let row = sqlx::query_as(&format!(
        "insert into cash_flows (account_id, occurred_at, kind, amount, note)
         values ($1, $2, $3, $4, $5) returning {COLUMNS}"
    ))
    .bind(id)
    .bind(body.occurred_at)
    .bind(body.kind)
    .bind(body.amount)
    .bind(note)
    .fetch_one(&pool)
    .await?;
    Ok(Json(row))
}

pub async fn remove(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path((id, flow)): Path<(String, String)>,
) -> ApiResult<StatusCode> {
    let id = owned_account(&pool, &user, &id).await?;
    let flow: Uuid = flow.parse().map_err(|_| NOT_FOUND)?;
    let done = sqlx::query("delete from cash_flows where id = $1 and account_id = $2")
        .bind(flow)
        .bind(id)
        .execute(&pool)
        .await?;
    if done.rows_affected() == 0 {
        return Err(NOT_FOUND);
    }
    Ok(StatusCode::NO_CONTENT)
}
