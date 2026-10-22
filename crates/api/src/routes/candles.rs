//! Price candles for the trade chart. Every bar from TradingView is kept in `candles`, and every time range
//! already asked for in `candle_ranges` (also when it had no bars), so each range is fetched once.

use axum::extract::{Path, State};
use chrono::{DateTime, Duration, TimeZone, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgPool;

use super::accounts::owned_account;
use crate::auth::UserId;
use crate::error::{ApiError, ApiResult};
use crate::extract::{Json, Query};
use crate::tradingview::{self, Bar, FetchError};

/// Candle lengths and their seconds, shortest first.
const LENGTHS: [(&str, i64); 6] = [
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

/// `{ symbol, tf, candles }`, oldest first. Without an account TradingView has no short candles far back,
/// so `tf` can be longer than asked: the first length, from the one asked, that has bars in the window.
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
    let start = LENGTHS
        .iter()
        .position(|(k, _)| *k == tf)
        .ok_or_else(|| ApiError::bad_request("Use 1m, 5m, 15m, 1h, 4h or 1d for \"tf\"."))?;
    let (Some(from), Some(to)) = (q.from, q.to) else {
        return Err(ApiError::bad_request(
            "Send \"from\" and \"to\" as ISO times.",
        ));
    };
    if from >= to {
        return Err(ApiError::bad_request("\"from\" must be before \"to\"."));
    }
    if (to - from).num_seconds() / LENGTHS[start].1 > MAX_CANDLES {
        return Err(ApiError::Unprocessable(format!(
            "That is more than {MAX_CANDLES} candles. Pick a longer candle or a shorter window."
        )));
    }
    owned_account(&pool, &user, &id).await?;

    for &(len, secs) in &LENGTHS[start..] {
        if !covered(&pool, &symbol, len, from, to).await? {
            fetch(&pool, &symbol, len, secs, from, to).await?;
        }
        // The bar that holds `from` starts up to one length before it.
        let bars = stored(&pool, &symbol, len, from - Duration::seconds(secs), to).await?;
        if !bars.is_empty() {
            return Ok(Json(
                json!({ "symbol": symbol, "tf": len, "candles": bars }),
            ));
        }
    }
    Err(ApiError::NotFound("No prices for this symbol and time."))
}

/// Asks TradingView for the window, keeps the bars, and records the range as asked, with or without bars.
async fn fetch(
    pool: &PgPool,
    symbol: &str,
    len: &str,
    secs: i64,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> ApiResult<()> {
    let count = ((to - from).num_seconds() / secs + 2).min(5000) as u32;
    let bars = match tradingview::bars(symbol, len, to.timestamp(), count).await {
        Ok(bars) => bars,
        Err(FetchError::NoData) => vec![],
        Err(FetchError::Symbol) => return Err(ApiError::NotFound("No prices for this symbol.")),
        Err(FetchError::Other(e)) => return Err(ApiError::Internal(e)),
    };
    let mut tx = pool.begin().await?;
    sqlx::query(
        "insert into candles (symbol, tf, time, open, high, low, close)
         select $1, $2, * from unnest($3::timestamptz[], $4::float8[], $5::float8[], $6::float8[], $7::float8[])
         on conflict (symbol, tf, time) do update set open = excluded.open, high = excluded.high,
            low = excluded.low, close = excluded.close",
    )
    .bind(symbol)
    .bind(len)
    .bind(bars.iter().map(|b| Utc.timestamp_opt(b.time, 0).unwrap()).collect::<Vec<_>>())
    .bind(bars.iter().map(|b| b.open).collect::<Vec<_>>())
    .bind(bars.iter().map(|b| b.high).collect::<Vec<_>>())
    .bind(bars.iter().map(|b| b.low).collect::<Vec<_>>())
    .bind(bars.iter().map(|b| b.close).collect::<Vec<_>>())
    .execute(&mut *tx)
    .await?;
    // The answer covers everything from its first bar (often before `from`) to `to`. The part of a
    // window still in the future can gain bars, so it is not recorded.
    let first = bars
        .first()
        .map_or(from, |b| from.min(Utc.timestamp_opt(b.time, 0).unwrap()));
    let until = to.min(Utc::now());
    if first < until {
        sqlx::query("insert into candle_ranges (symbol, tf, from_at, to_at) values ($1, $2, $3, $4) on conflict do nothing")
            .bind(symbol)
            .bind(len)
            .bind(first)
            .bind(until)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// The ranges already asked for cover all of `from` to `to`.
async fn covered(
    pool: &PgPool,
    symbol: &str,
    len: &str,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> ApiResult<bool> {
    let ranges: Vec<(DateTime<Utc>, DateTime<Utc>)> = sqlx::query_as(
        "select from_at, to_at from candle_ranges where symbol = $1 and tf = $2 and from_at <= $4 and to_at >= $3
         order by from_at",
    )
    .bind(symbol)
    .bind(len)
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;
    Ok(covers(&ranges, from, to))
}

/// Walks the sorted ranges from `from`; covered when no gap is left before `to`.
fn covers(
    sorted: &[(DateTime<Utc>, DateTime<Utc>)],
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> bool {
    let mut reached = from;
    for &(a, b) in sorted {
        if a > reached {
            break;
        }
        reached = reached.max(b);
    }
    reached >= to
}

async fn stored(
    pool: &PgPool,
    symbol: &str,
    len: &str,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> ApiResult<Vec<Value>> {
    let rows: Vec<(DateTime<Utc>, f64, f64, f64, f64)> = sqlx::query_as(
        "select time, open, high, low, close from candles
         where symbol = $1 and tf = $2 and time >= $3 and time <= $4 order by time",
    )
    .bind(symbol)
    .bind(len)
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(t, open, high, low, close)| {
            json!(Bar {
                time: t.timestamp(),
                open,
                high,
                low,
                close
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coverage() {
        let t = |m: i64| Utc.timestamp_opt(m * 60, 0).unwrap();
        let r = [(t(0), t(10)), (t(10), t(20)), (t(25), t(30))];
        assert!(covers(&r, t(2), t(20)));
        assert!(!covers(&r, t(2), t(26)));
        assert!(!covers(&r[2..], t(20), t(30)));
        assert!(!covers(&[], t(0), t(1)));
    }
}
