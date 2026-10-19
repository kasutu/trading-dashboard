//! Trading accounts: list, create, update, delete, plus the ownership check.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::auth::UserId;
use crate::error::{ApiError, ApiResult};
use crate::extract::Json;

const NOT_FOUND: ApiError = ApiError::NotFound("This account does not exist.");

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    id: Uuid,
    name: String,
    broker: Option<String>,
    currency: String,
    created_at: DateTime<Utc>,
    trades: i64,
}

const SELECT: &str = "select a.id, a.name, a.broker, a.currency, a.created_at,
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

#[derive(Deserialize)]
pub struct AccountPatch {
    name: Option<String>,
    /// Absent: keep. `null` or "": clear.
    #[serde(default, deserialize_with = "present")]
    broker: Option<Option<String>>,
    currency: Option<String>,
}

/// Tells a field set to `null` apart from a missing one.
fn present<'de, D: Deserializer<'de>>(d: D) -> Result<Option<Option<String>>, D::Error> {
    Option::<String>::deserialize(d).map(Some)
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
    sqlx::query(
        "update trading_accounts set
            name = coalesce($2, name),
            broker = case when $3 then $4 else broker end,
            currency = coalesce($5, currency)
         where id = $1",
    )
    .bind(id)
    .bind(name)
    .bind(body.broker.is_some())
    .bind(body.broker.and_then(clean_broker))
    .bind(currency)
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
