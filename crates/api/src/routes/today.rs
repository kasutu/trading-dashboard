//! `GET /api/accounts/:id/today?tz=`: the Today card (see `engine::today`).

use axum::extract::{Path, State};
use serde_json::{json, Value};
use sqlx::PgPool;

use super::accounts::owned_account;
use super::analytics::parse_tz;
use super::cash_flows::TzQuery;
use crate::auth::UserId;
use crate::error::ApiResult;
use crate::extract::{Json, Query};

/// `TodayPlan`, or `{ "empty": true }` when the account has no trades.
pub async fn today(
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
    let plan = crate::today::plan_for(&pool, &user, id, tz).await?;
    Ok(Json(match plan {
        Some(p) => json!(p),
        None => json!({ "empty": true }),
    }))
}
