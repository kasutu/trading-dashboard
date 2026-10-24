//! Trading accounts: list, create, update, delete, plus the ownership check.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use sqlx::types::Json as Jsonb;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::auth::UserId;
use crate::error::{ApiError, ApiResult};
use crate::extract::Json;
use crate::plan::Plan;

const NOT_FOUND: ApiError = ApiError::NotFound("This account does not exist.");

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    id: Uuid,
    name: String,
    broker: Option<String>,
    currency: String,
    /// The MetaTrader login, set by the first MT5 report import.
    mt_login: Option<String>,
    risk: Option<Jsonb<Risk>>,
    created_at: DateTime<Utc>,
    trades: i64,
}

const SELECT: &str = "select a.id, a.name, a.broker, a.currency, a.mt_login, a.risk, a.created_at,
    (select count(*) from trades t where t.account_id = a.id) as trades
    from trading_accounts a";

/// Parses `:id` and checks that the account belongs to the user. 404 otherwise.
pub async fn owned_account(pool: &PgPool, user: &str, id: &str) -> ApiResult<Uuid> {
    let id: Uuid = id.parse().map_err(|_| NOT_FOUND)?;
    let found: Option<Uuid> =
        sqlx::query_scalar("select id from trading_accounts where id = $1 and user_id = $2")
            .bind(id)
            .bind(user)
            .fetch_optional(pool)
            .await?;
    found.ok_or(NOT_FOUND)
}

async fn fetch(pool: &PgPool, id: Uuid) -> ApiResult<Account> {
    Ok(sqlx::query_as(&format!("{SELECT} where a.id = $1"))
        .bind(id)
        .fetch_one(pool)
        .await?)
}

pub async fn list(
    State(pool): State<PgPool>,
    UserId(user): UserId,
) -> ApiResult<Json<Vec<Account>>> {
    let rows = sqlx::query_as(&format!(
        "{SELECT} where a.user_id = $1 order by a.created_at"
    ))
    .bind(user)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
pub struct NewAccount {
    name: String,
    broker: Option<String>,
    currency: Option<String>,
}

pub async fn create(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Json(body): Json<NewAccount>,
) -> ApiResult<Json<Account>> {
    let name = clean_name(&body.name)?;
    let currency = body.currency.as_deref().map(clean_currency).transpose()?;
    let plan = Plan::of(&pool, &user).await?;
    let count: i64 = sqlx::query_scalar("select count(*) from trading_accounts where user_id = $1")
        .bind(&user)
        .fetch_one(&pool)
        .await?;
    if count >= plan.max_accounts() {
        return Err(ApiError::Forbidden(if plan == Plan::Latte {
            "Latte includes up to 5 trading accounts. Delete an account to add a new one.".into()
        } else {
            "Your plan includes 1 trading account. Latte includes up to 5.".into()
        }));
    }
    let id: Uuid = sqlx::query_scalar(
        "insert into trading_accounts (user_id, name, broker, currency)
         values ($1, $2, $3, coalesce($4, 'USD')) returning id",
    )
    .bind(user)
    .bind(name)
    .bind(clean_broker(body.broker))
    .bind(currency)
    .fetch_one(&pool)
    .await?;
    Ok(Json(fetch(&pool, id).await?))
}

/// Risk limits. Each limit is optional. `daily` and `per_trade` are a % of the balance or dollars, by `kind`.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Risk {
    kind: RiskKind,
    daily: Option<f64>,
    per_trade: Option<f64>,
    max_trades: Option<u32>,
}

#[derive(Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum RiskKind {
    Percent,
    Amount,
}

fn check_risk(r: &Risk) -> ApiResult<()> {
    let max = if r.kind == RiskKind::Percent { 100.0 } else { 1e9 };
    for v in [r.daily, r.per_trade].into_iter().flatten() {
        if !v.is_finite() || v <= 0.0 || v > max {
            return Err(ApiError::bad_request(if max == 100.0 {
                "Enter a risk above 0% and up to 100%."
            } else {
                "Enter a risk amount above 0."
            }));
        }
    }
    if r.max_trades.is_some_and(|n| !(1..=100).contains(&n)) {
        return Err(ApiError::bad_request("Enter 1 to 100 trades a day."));
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct AccountPatch {
    name: Option<String>,
    /// Absent: keep. `null` or "": clear.
    #[serde(default, deserialize_with = "present")]
    broker: Option<Option<String>>,
    currency: Option<String>,
    /// Absent: keep. `null`: clear.
    #[serde(default, deserialize_with = "present")]
    risk: Option<Option<Risk>>,
}

/// Tells a field set to `null` apart from a missing one.
fn present<'de, T: Deserialize<'de>, D: Deserializer<'de>>(d: D) -> Result<Option<Option<T>>, D::Error> {
    Option::<T>::deserialize(d).map(Some)
}

pub async fn update(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Json(body): Json<AccountPatch>,
) -> ApiResult<Json<Account>> {
    let id = owned_account(&pool, &user, &id).await?;
    let name = body.name.as_deref().map(clean_name).transpose()?;
    let currency = body.currency.as_deref().map(clean_currency).transpose()?;
    if let Some(Some(r)) = &body.risk {
        check_risk(r)?;
    }
    sqlx::query(
        "update trading_accounts set
            name = coalesce($2, name),
            broker = case when $3 then $4 else broker end,
            currency = coalesce($5, currency),
            risk = case when $6 then $7 else risk end
         where id = $1",
    )
    .bind(id)
    .bind(name)
    .bind(body.broker.is_some())
    .bind(body.broker.and_then(clean_broker))
    .bind(currency)
    .bind(body.risk.is_some())
    .bind(body.risk.flatten().map(Jsonb))
    .execute(&pool)
    .await?;
    Ok(Json(fetch(&pool, id).await?))
}

pub async fn remove(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    let id = owned_account(&pool, &user, &id).await?;
    sqlx::query("delete from trading_accounts where id = $1")
        .bind(id)
        .execute(&pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

fn clean_name(name: &str) -> ApiResult<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request("Give the account a name."));
    }
    Ok(name.to_string())
}

fn clean_currency(currency: &str) -> ApiResult<String> {
    let c = currency.trim().to_uppercase();
    if c.len() != 3 || !c.chars().all(|ch| ch.is_ascii_alphabetic()) {
        return Err(ApiError::bad_request(
            "Use a three-letter currency code such as \"USD\".",
        ));
    }
    Ok(c)
}

fn clean_broker(broker: Option<String>) -> Option<String> {
    broker
        .map(|b| b.trim().to_string())
        .filter(|b| !b.is_empty())
}
