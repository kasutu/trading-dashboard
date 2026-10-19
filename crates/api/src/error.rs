//! The error type every handler returns. Renders as `{ "error": "<message>" }`.

use axum::extract::rejection::{JsonRejection, QueryRejection};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug)]
pub enum ApiError {
    BadRequest(String),
    Unauthorized,
    NotFound(&'static str),
    Unprocessable(String),
    Internal(String),
}

pub type ApiResult<T> = Result<T, ApiError>;

impl ApiError {
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self::BadRequest(msg.into())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, msg) = match self {
            Self::BadRequest(m) => (StatusCode::BAD_REQUEST, m),
            Self::Unauthorized => (StatusCode::UNAUTHORIZED, "Sign in to continue.".into()),
            Self::NotFound(m) => (StatusCode::NOT_FOUND, m.into()),
            Self::Unprocessable(m) => (StatusCode::UNPROCESSABLE_ENTITY, m),
            Self::Internal(detail) => {
                tracing::error!("{detail}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Something went wrong on our side. Try again.".into(),
                )
            }
        };
        (status, Json(json!({ "error": msg }))).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        Self::Internal(format!("database: {e}"))
    }
}

impl From<JsonRejection> for ApiError {
    fn from(e: JsonRejection) -> Self {
        Self::BadRequest(format!("The request body is not valid: {}", e.body_text()))
    }
}

impl From<QueryRejection> for ApiError {
    fn from(e: QueryRejection) -> Self {
        Self::BadRequest(format!("The query string is not valid: {}", e.body_text()))
    }
}
