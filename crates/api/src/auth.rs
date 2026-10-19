//! Session extractor. Reads the Better Auth session cookie and looks up the user.

use axum::extract::{FromRef, FromRequestParts};
use axum::http::header::COOKIE;
use axum::http::request::Parts;
use sqlx::PgPool;

use crate::error::ApiError;

/// Cookie names Better Auth uses, the HTTPS one first.
const COOKIE_NAMES: [&str; 2] = [
    "__Secure-better-auth.session_token",
    "better-auth.session_token",
];

/// The Better Auth user id of the signed-in user.
pub struct UserId(pub String);

impl<S> FromRequestParts<S> for UserId
where
    PgPool: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let token = session_token(parts).ok_or(ApiError::Unauthorized)?;
        let pool = PgPool::from_ref(state);
        let user_id: Option<String> = sqlx::query_scalar(
            r#"select "userId" from "session" where "token" = $1 and "expiresAt" > now()"#,
        )
        .bind(token)
        .fetch_optional(&pool)
        .await?;
        user_id.map(UserId).ok_or(ApiError::Unauthorized)
    }
}

/// The token part (before the first `.`) of the session cookie, URL-decoded.
fn session_token(parts: &Parts) -> Option<String> {
    let cookies: Vec<(&str, &str)> = parts
        .headers
        .get_all(COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .filter_map(|c| c.trim().split_once('='))
        .collect();
    let raw = COOKIE_NAMES
        .iter()
        .find_map(|name| cookies.iter().find(|(n, _)| n == name).map(|(_, v)| *v))?;
    let decoded = percent_encoding::percent_decode_str(raw)
        .decode_utf8()
        .ok()?;
    let token = decoded.split('.').next().unwrap_or_default();
    (!token.is_empty()).then(|| token.to_string())
}
