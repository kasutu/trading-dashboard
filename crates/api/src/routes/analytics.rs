//! Analytics and the trades table. Both load the account's trades and run the engine.

use axum::extract::{Path, State};
use chrono::NaiveDate;
use chrono_tz::Tz;
use engine::{Filters, Side};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgPool;

use super::accounts::owned_account;
use crate::auth::UserId;
use crate::error::{ApiError, ApiResult};
use crate::extract::{Json, Query};
use crate::plan::Plan;
use crate::trade_row::load_trades;

/// Query string shared by analytics and trades. Validated by [`FilterQuery::filters`].
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterQuery {
    range: Option<String>,
    symbol: Option<String>,
    side: Option<String>,
    tz: Option<String>,
}

impl FilterQuery {
    fn filters(self) -> ApiResult<Filters> {
        let range_days = match self.range.as_deref() {
            None | Some("all") => None,
            Some("7") => Some(7),
            Some("30") => Some(30),
            Some("90") => Some(90),
            Some(_) => return Err(ApiError::bad_request("Use 7, 30, 90 or all for \"range\".")),
        };
        let side = match self.side.as_deref() {
            None | Some("") => None,
            Some("buy") => Some(Side::Buy),
            Some("sell") => Some(Side::Sell),
            Some(_) => return Err(ApiError::bad_request("Use buy or sell for \"side\".")),
        };
        let tz = self.tz.unwrap_or_else(|| "UTC".into());
        parse_tz(&tz)?;
        Ok(Filters {
            range_days,
            symbol: self.symbol.filter(|s| !s.is_empty()),
            side,
            tz,
        })
    }
}

/// Checks that `tz` is an IANA timezone name.
pub fn parse_tz(tz: &str) -> ApiResult<Tz> {
    tz.parse().map_err(|_| {
        ApiError::bad_request(format!(
            "\"{tz}\" is not a known timezone. Use an IANA name such as \"UTC\" or \"Europe/London\"."
        ))
    })
}

/// Runs CPU-heavy engine work off the async threads.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> ApiResult<T> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| ApiError::Internal(format!("engine crashed: {e}")))
}

pub async fn analytics(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Query(q): Query<FilterQuery>,
) -> ApiResult<Json<Value>> {
    let filters = q.filters()?;
    let id = owned_account(&pool, &user, &id).await?;
    let trades = load_trades(&pool, id).await?;
    let plan = Plan::of(&pool, &user).await?;
    let result = blocking(move || engine::analyze(&trades, &filters)).await?;
    Ok(Json(match result {
        Some(a) => plan.restrict(json!(a)),
        None => json!({ "empty": true }),
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradesQuery {
    #[serde(flatten)]
    filters: FilterQuery,
    from: Option<String>,
    to: Option<String>,
    page: Option<String>,
    page_size: Option<String>,
}

pub async fn trades(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Query(q): Query<TradesQuery>,
) -> ApiResult<Json<Value>> {
    let filters = q.filters.filters()?;
    let from = day(q.from, "from")?;
    let to = day(q.to, "to")?;
    let page: usize = number(q.page, "page", 0)?;
    // ponytail: page sizes above the max are clamped, not rejected.
    let page_size: usize = number(q.page_size, "pageSize", 25)?.clamp(1, 500);
    let id = owned_account(&pool, &user, &id).await?;
    let trades = load_trades(&pool, id).await?;
    let body = blocking(move || {
        let rows = engine::filter_trades(&trades, &filters, from.as_deref(), to.as_deref());
        let page_rows: Vec<_> = rows.iter().skip(page * page_size).take(page_size).collect();
        json!({ "rows": page_rows, "total": rows.len() })
    })
    .await?;
    Ok(Json(body))
}

/// Validates an optional yyyy-mm-dd query value.
fn day(value: Option<String>, name: &str) -> ApiResult<Option<String>> {
    match value.filter(|v| !v.is_empty()) {
        Some(v) if NaiveDate::parse_from_str(&v, "%Y-%m-%d").is_err() => Err(
            ApiError::bad_request(format!("Use yyyy-mm-dd for \"{name}\".")),
        ),
        v => Ok(v),
    }
}

/// Parses an optional non-negative whole number query value.
fn number(value: Option<String>, name: &str, default: usize) -> ApiResult<usize> {
    match value.filter(|v| !v.is_empty()) {
        None => Ok(default),
        Some(v) => v
            .parse()
            .map_err(|_| ApiError::bad_request(format!("\"{name}\" must be a whole number."))),
    }
}
