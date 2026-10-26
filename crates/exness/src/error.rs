use serde::Deserialize;

/// The public error body: `{"code": 3015, "error_message": "REQUEST_RATE_LIMIT"}`.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ApiError {
    pub code: i32,
    pub error_message: String,
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid private key: {0}")]
    Key(String),
    #[error("missing setting: {0}")]
    Config(String),
    #[error("invalid idempotency key: {0}")]
    IdempotencyKey(String),
    #[error("HTTP {status}: {} ({})", .error.error_message, .error.code)]
    Api { status: u16, error: ApiError },
    /// A non-2xx response whose body is not the public error model.
    #[error("HTTP {status}: {body}")]
    Http { status: u16, body: String },
    #[error(transparent)]
    Transport(#[from] reqwest::Error),
    #[error("timed out: {0}")]
    Timeout(String),
    #[error("cannot decode response: {0}")]
    Decode(#[from] serde_json::Error),
}
