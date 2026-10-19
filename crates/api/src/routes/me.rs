//! `GET /api/me`.

use axum::extract::State;
use axum::Json;
use serde::Serialize;
use sqlx::PgPool;

use crate::auth::UserId;
use crate::error::ApiResult;

#[derive(Serialize)]
pub struct Me {
    id: String,
    username: Option<String>,
    plan: String,
}

/// The signed-in user. Creates the profile row on the first call.
pub async fn me(State(pool): State<PgPool>, UserId(id): UserId) -> ApiResult<Json<Me>> {
    let plan: String = sqlx::query_scalar(
        "insert into profiles (user_id) values ($1)
         on conflict (user_id) do update set user_id = excluded.user_id
         returning plan",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await?;
    let username: Option<String> =
        sqlx::query_scalar(r#"select coalesce("username", "name") from "user" where "id" = $1"#)
            .bind(&id)
            .fetch_optional(&pool)
            .await?
            .flatten();
    Ok(Json(Me { id, username, plan }))
}
