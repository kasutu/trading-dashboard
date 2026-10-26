//! `GET /api/me` and `PATCH /api/me/settings`.

use axum::extract::State;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::types::Json as Jsonb;
use sqlx::PgPool;

use crate::auth::UserId;
use crate::config::features;
use crate::error::{ApiError, ApiResult};
use crate::extract::Json;

/// Settings that follow the user to every device (`profiles.settings`).
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Show the before-trading check-in when the dashboard opens.
    #[serde(default = "yes")]
    pub check_in: bool,
    /// The smallest reward-to-risk the playbook accepts without a warning.
    #[serde(default)]
    pub min_rr: Option<f64>,
}

fn yes() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            check_in: true,
            min_rr: None,
        }
    }
}

/// The user's settings, with defaults for keys never saved.
pub async fn settings_of(pool: &PgPool, user: &str) -> ApiResult<Settings> {
    let raw: Option<Jsonb<Value>> =
        sqlx::query_scalar("select settings from profiles where user_id = $1")
            .bind(user)
            .fetch_optional(pool)
            .await?;
    Ok(raw
        .and_then(|r| serde_json::from_value(r.0).ok())
        .unwrap_or_default())
}

#[derive(Serialize)]
pub struct Me {
    id: String,
    username: Option<String>,
    plan: String,
    settings: Settings,
    /// Server features the web app shows: `exness` (account connection), `email` (sending on).
    features: Value,
}

/// The signed-in user. Creates the profile row on the first call.
pub async fn me(State(pool): State<PgPool>, UserId(id): UserId) -> ApiResult<Json<Me>> {
    let (plan, settings): (String, Jsonb<Value>) = sqlx::query_as(
        "insert into profiles (user_id) values ($1)
         on conflict (user_id) do update set user_id = excluded.user_id
         returning plan, settings",
    )
    .bind(&id)
    .fetch_one(&pool)
    .await?;
    let username: Option<String> = sqlx::query_scalar(
        r#"select coalesce("displayUsername", "username", "name") from "user" where "id" = $1"#,
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await?
    .flatten();
    let f = features();
    Ok(Json(Me {
        id,
        username,
        plan,
        settings: serde_json::from_value(settings.0).unwrap_or_default(),
        features: json!({ "exness": f.exness_sync, "email": f.resend_api_key.is_some() }),
    }))
}

/// Changes some settings. Keys left out are kept; `minRr: null` clears it.
pub async fn update_settings(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Json(patch): Json<serde_json::Map<String, Value>>,
) -> ApiResult<Json<Settings>> {
    let mut s = settings_of(&pool, &user).await?;
    for (k, v) in patch {
        match k.as_str() {
            "checkIn" => {
                s.check_in = v
                    .as_bool()
                    .ok_or_else(|| ApiError::bad_request("\"checkIn\" must be true or false."))?
            }
            "minRr" => {
                s.min_rr =
                    match v {
                        Value::Null => None,
                        v => Some(v.as_f64().filter(|n| *n > 0.0 && *n <= 100.0).ok_or_else(
                            || ApiError::bad_request("Enter a minimum R:R above 0 and up to 100."),
                        )?),
                    }
            }
            other => {
                return Err(ApiError::bad_request(format!(
                    "\"{other}\" is not a setting. Use checkIn or minRr."
                )))
            }
        }
    }
    sqlx::query(
        "insert into profiles (user_id, settings) values ($1, $2)
         on conflict (user_id) do update set settings = excluded.settings",
    )
    .bind(&user)
    .bind(Jsonb(&s))
    .execute(&pool)
    .await?;
    Ok(Json(s))
}
