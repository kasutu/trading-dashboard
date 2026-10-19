//! Saved column mappings.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use engine::ColumnMapping;
use serde::{Deserialize, Serialize};
use sqlx::types::Json as SqlJson;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::analytics::parse_tz;
use crate::auth::UserId;
use crate::error::{ApiError, ApiResult};
use crate::extract::Json;

const NOT_FOUND: ApiError = ApiError::NotFound("This mapping does not exist.");

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SavedMapping {
    id: Uuid,
    name: String,
    mapping: SqlJson<ColumnMapping>,
    created_at: DateTime<Utc>,
}

pub async fn list(
    State(pool): State<PgPool>,
    UserId(user): UserId,
) -> ApiResult<Json<Vec<SavedMapping>>> {
    let rows = sqlx::query_as(
        "select id, name, mapping, created_at from column_mappings
         where user_id = $1 order by created_at",
    )
    .bind(user)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
pub struct NewMapping {
    name: String,
    mapping: ColumnMapping,
}

pub async fn create(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Json(body): Json<NewMapping>,
) -> ApiResult<Json<SavedMapping>> {
    let name = body.name.trim();
    if name.is_empty() {
        return Err(ApiError::bad_request("Give the mapping a name."));
    }
    parse_tz(&body.mapping.timestamps_tz)?;
    let row = sqlx::query_as(
        "insert into column_mappings (user_id, name, mapping) values ($1, $2, $3)
         returning id, name, mapping, created_at",
    )
    .bind(user)
    .bind(name)
    .bind(SqlJson(body.mapping))
    .fetch_one(&pool)
    .await?;
    Ok(Json(row))
}

pub async fn remove(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
) -> ApiResult<StatusCode> {
    let id: Uuid = id.parse().map_err(|_| NOT_FOUND)?;
    let done = sqlx::query("delete from column_mappings where id = $1 and user_id = $2")
        .bind(id)
        .bind(user)
        .execute(&pool)
        .await?;
    if done.rows_affected() == 0 {
        return Err(NOT_FOUND);
    }
    Ok(StatusCode::NO_CONTENT)
}
