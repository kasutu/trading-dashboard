//! Price candles for the trade chart. Asks the prices service (`PRICES_URL`, see apps/prices) and caches
//! each window in `candle_cache`, so a window is fetched once.

use std::sync::OnceLock;
use std::time::Duration;

use axum::extract::{Path, State};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgPool;

use super::accounts::owned_account;
use crate::auth::UserId;
use crate::error::{ApiError, ApiResult};
use crate::extract::{Json, Query};

/// Candle lengths and their seconds.
const TIMEFRAMES: [(&str, i64); 6] = [
    ("1m", 60),
    ("5m", 300),
    ("15m", 900),
    ("1h", 3600),
    ("4h", 14400),
    ("1d", 86400),
];
const MAX_CANDLES: i64 = 2000;

#[derive(Deserialize)]
pub struct CandleQuery {
    symbol: Option<String>,
    tf: Option<String>,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
struct Fetched {
    tf: String,
    candles: Value,
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .unwrap()
    })
}

/// `{ symbol, tf, candles }`, oldest first. `tf` can be longer than asked when the source has no shorter candles
/// that far back.
pub async fn candles(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Query(q): Query<CandleQuery>,
) -> ApiResult<Json<Value>> {
    let symbol = q
        .symbol
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| ApiError::bad_request("Send a symbol."))?;
    let tf = q.tf.unwrap_or_default();
    let secs = TIMEFRAMES
        .iter()
        .find(|(k, _)| *k == tf)
        .map(|(_, s)| *s)
        .ok_or_else(|| ApiError::bad_request("Use 1m, 5m, 15m, 1h, 4h or 1d for \"tf\"."))?;
    let (Some(from), Some(to)) = (q.from, q.to) else {
        return Err(ApiError::bad_request(
            "Send \"from\" and \"to\" as ISO times.",
        ));
    };
    if from >= to {
        return Err(ApiError::bad_request("\"from\" must be before \"to\"."));
    }
    if (to - from).num_seconds() / secs > MAX_CANDLES {
        return Err(ApiError::Unprocessable(format!(
            "That is more than {MAX_CANDLES} candles. Pick a longer candle or a shorter window."
        )));
    }
    owned_account(&pool, &user, &id).await?;

    let cached: Option<(String, Value)> = sqlx::query_as(
        "select served_tf, candles from candle_cache where symbol = $1 and tf = $2 and from_at = $3 and to_at = $4",
    )
    .bind(&symbol)
    .bind(&tf)
    .bind(from)
    .bind(to)
    .fetch_optional(&pool)
    .await?;
    if let Some((served, candles)) = cached {
        return Ok(Json(
            json!({ "symbol": symbol, "tf": served, "candles": candles }),
        ));
    }

    let base = std::env::var("PRICES_URL")
        .map_err(|_| ApiError::NotFound("Price data is not set up on this server."))?;
    let res = client()
        .get(format!("{}/candles", base.trim_end_matches('/')))
        .query(&[
            ("symbol", symbol.as_str()),
            ("tf", tf.as_str()),
            ("from", &from.to_rfc3339()),
            ("to", &to.to_rfc3339()),
        ])
        .send()
        .await
        .map_err(|e| ApiError::Internal(format!("prices service: {e}")))?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err(ApiError::NotFound("No prices for this symbol and time."));
    }
    if !res.status().is_success() {
        return Err(ApiError::Internal(format!(
            "prices service answered {}",
            res.status()
        )));
    }
    let got: Fetched = res
        .json()
        .await
        .map_err(|e| ApiError::Internal(format!("prices service: {e}")))?;

    // A window that ends in the future can still gain bars, so only past windows are kept.
    if to < Utc::now() {
        sqlx::query(
            "insert into candle_cache (symbol, tf, from_at, to_at, served_tf, candles) values ($1, $2, $3, $4, $5, $6)
             on conflict do nothing",
        )
        .bind(&symbol)
        .bind(&tf)
        .bind(from)
        .bind(to)
        .bind(&got.tf)
        .bind(&got.candles)
        .execute(&pool)
        .await?;
    }
    Ok(Json(
        json!({ "symbol": symbol, "tf": got.tf, "candles": got.candles }),
    ))
}
