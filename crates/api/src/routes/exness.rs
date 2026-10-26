//! Exness connection of a trading account (see `exness_sync.rs`).
//!
//! - `GET /api/accounts/:id/exness`: the connection status. Never returns the keys.
//! - `PUT /api/accounts/:id/exness`: `{ accountId, apiKey, privateKey, host? }`. Checks the keys
//!   with Exness, stores them encrypted, and starts the first sync. Paid plans.
//! - `DELETE /api/accounts/:id/exness`: deletes the stored keys and history. Trades stay.
//! - `POST /api/accounts/:id/exness/sync`: syncs now.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use exness::Signer;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::accounts::owned_account;
use crate::auth::UserId;
use crate::config::features;
use crate::crypto;
use crate::error::{ApiError, ApiResult};
use crate::exness_sync::{self, explain};
use crate::extract::Json;
use crate::plan::Plan;

#[derive(FromRow)]
struct Row {
    exness_account_id: String,
    host: String,
    status: String,
    failures: i32,
    last_error: Option<String>,
    last_sync_at: Option<DateTime<Utc>>,
    last_sync_trades: Option<i32>,
    last_sync_flows: Option<i32>,
    synced_until: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    /// The feature flag (`EXNESS_SYNC`). Off: the web app hides the connection.
    enabled: bool,
    /// The server has `CREDENTIALS_KEY`, so keys can be stored.
    can_connect: bool,
    /// Connecting is on paid plans.
    locked: bool,
    connected: bool,
    exness_account_id: Option<String>,
    host: Option<String>,
    /// "ok", "failing" or "paused".
    status: Option<String>,
    failures: i32,
    last_error: Option<String>,
    last_sync_at: Option<DateTime<Utc>>,
    last_sync_trades: Option<i32>,
    last_sync_flows: Option<i32>,
    synced_until: Option<DateTime<Utc>>,
    connected_at: Option<DateTime<Utc>>,
}

async fn status(pool: &PgPool, user: &str, account: Uuid) -> ApiResult<Connection> {
    let row: Option<Row> = sqlx::query_as(
        "select exness_account_id, host, status, failures, last_error, last_sync_at, last_sync_trades,
            last_sync_flows, synced_until, created_at
         from exness_connections where account_id = $1",
    )
    .bind(account)
    .fetch_optional(pool)
    .await?;
    let f = features();
    let locked = !Plan::of(pool, user).await?.is_paid();
    Ok(match row {
        Some(r) => Connection {
            enabled: f.exness_sync,
            can_connect: f.credentials_key.is_some(),
            locked,
            connected: true,
            exness_account_id: Some(r.exness_account_id),
            host: Some(r.host),
            status: Some(r.status),
            failures: r.failures,
            last_error: r.last_error,
            last_sync_at: r.last_sync_at,
            last_sync_trades: r.last_sync_trades,
            last_sync_flows: r.last_sync_flows,
            synced_until: r.synced_until,
            connected_at: Some(r.created_at),
        },
        None => Connection {
            enabled: f.exness_sync,
            can_connect: f.credentials_key.is_some(),
            locked,
            connected: false,
            exness_account_id: None,
            host: None,
            status: None,
            failures: 0,
            last_error: None,
            last_sync_at: None,
            last_sync_trades: None,
            last_sync_flows: None,
            synced_until: None,
            connected_at: None,
        },
    })
}

pub async fn get(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
) -> ApiResult<Json<Connection>> {
    let id = owned_account(&pool, &user, &id).await?;
    Ok(Json(status(&pool, &user, id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Connect {
    account_id: String,
    api_key: String,
    private_key: String,
    host: Option<String>,
}

fn flag_off() -> ApiError {
    ApiError::Forbidden("Exness connections are turned off on this server.".into())
}

pub async fn connect(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Json(b): Json<Connect>,
) -> ApiResult<Json<Connection>> {
    let id = owned_account(&pool, &user, &id).await?;
    if !features().exness_sync {
        return Err(flag_off());
    }
    if !Plan::of(&pool, &user).await?.is_paid() {
        return Err(ApiError::Forbidden(
            "Syncing with Exness is on Espresso and Latte. File import stays free.".into(),
        ));
    }
    let ex = b.account_id.trim().to_string();
    if ex.is_empty() || ex.len() > 32 || !ex.chars().all(|c| c.is_ascii_digit()) {
        return Err(ApiError::bad_request(
            "Enter the Exness account number (digits only).",
        ));
    }
    let api_key = b.api_key.trim().to_string();
    if api_key.is_empty() || api_key.len() > 200 {
        return Err(ApiError::bad_request(
            "Enter the API key from Exness Key Management.",
        ));
    }
    let private_key = b.private_key.trim().to_string();
    // Check the server key before calling Exness, so a missing key fails fast.
    crypto::seal(id, "")?;
    let signer = Signer::from_key_text(api_key.clone(), &private_key)
        .map_err(|e| ApiError::bad_request(explain(&e)))?;

    let held: Option<String> =
        sqlx::query_scalar("select mt_login from trading_accounts where id = $1")
            .bind(id)
            .fetch_one(&pool)
            .await?;
    if let Some(held) = held.filter(|h| *h != ex) {
        return Err(ApiError::Conflict(format!(
            "This Jurno account holds MetaTrader account {held}. Connect Exness account {ex} to the Jurno account for it, or create a new one."
        )));
    }

    // The SDK's errors hold no key material, so they are safe to log.
    let refused = |e: exness::Error| {
        tracing::warn!("exness connect for {id}: {e}");
        ApiError::Unprocessable(explain(&e))
    };
    let client = exness_sync::connect_client(signer, &ex, b.host.as_deref())
        .await
        .map_err(refused)?;
    let details = client.account_details(&ex).await.map_err(refused)?;

    sqlx::query(
        "insert into exness_connections (account_id, exness_account_id, host, api_key, private_key)
         values ($1, $2, $3, $4, $5)
         on conflict (account_id) do update set exness_account_id = excluded.exness_account_id,
            host = excluded.host, api_key = excluded.api_key, private_key = excluded.private_key,
            status = 'ok', failures = 0, last_error = null,
            synced_until = case when exness_connections.exness_account_id = excluded.exness_account_id
                then exness_connections.synced_until end",
    )
    .bind(id)
    .bind(&ex)
    .bind(client.base_url())
    .bind(crypto::seal(id, &api_key)?)
    .bind(crypto::seal(id, &private_key)?)
    .execute(&pool)
    .await?;
    let currency = details.settings.as_ref().map(|s| s.currency.clone());
    sqlx::query(
        "update trading_accounts set mt_login = coalesce(mt_login, $2), broker = coalesce(broker, 'Exness'),
            currency = case when (select count(*) from trades where account_id = $1) = 0
                then coalesce($3, currency) else currency end
         where id = $1",
    )
    .bind(id)
    .bind(&ex)
    .bind(currency.filter(|c| c.len() == 3))
    .execute(&pool)
    .await?;

    // The first sync can take a while (months of history), so it runs on its own.
    let p = pool.clone();
    tokio::spawn(async move {
        if let Err(e) = exness_sync::sync(&p, id).await {
            tracing::warn!("first exness sync for {id}: {e:?}");
        }
    });
    Ok(Json(status(&pool, &user, id).await?))
}

pub async fn disconnect(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    let id = owned_account(&pool, &user, &id).await?;
    let mut tx = pool.begin().await?;
    sqlx::query("delete from exness_connections where account_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("delete from exness_history where account_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn sync_now(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
) -> ApiResult<Json<Connection>> {
    let id = owned_account(&pool, &user, &id).await?;
    if !features().exness_sync {
        return Err(flag_off());
    }
    if !Plan::of(&pool, &user).await?.is_paid() {
        return Err(ApiError::Forbidden(
            "Syncing with Exness is on Espresso and Latte.".into(),
        ));
    }
    let paused: Option<String> =
        sqlx::query_scalar("select status from exness_connections where account_id = $1")
            .bind(id)
            .fetch_optional(&pool)
            .await?;
    match paused.as_deref() {
        None => {
            return Err(ApiError::NotFound(
                "This account is not connected to Exness.",
            ))
        }
        Some("paused") => {
            return Err(ApiError::Conflict(
                "Syncing stopped after 3 failures. Connect the account again with working keys."
                    .into(),
            ))
        }
        _ => {}
    }
    // A failed sync is recorded on the connection; the status shows it.
    if let Err(e) = exness_sync::sync(&pool, id).await {
        if let ApiError::Conflict(_) = e {
            return Err(e);
        }
    }
    Ok(Json(status(&pool, &user, id).await?))
}
