use std::time::{SystemTime, UNIX_EPOCH};

use reqwest::Method;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::{ApiError, Error, Signer};

/// The answer from host discovery.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct AccessPoint {
    /// The host to use for this account, for example `ap-qwerty123.trading.exness.com`.
    pub access_point: String,
    /// The docs show a number here. Kept as raw JSON until the contract is confirmed.
    #[serde(default)]
    pub account_id: serde_json::Value,
}

/// A signed REST client. Every call gets a fresh timestamp and signature.
///
/// There is no default host. Use the host shown in Key Management after you
/// create the API key, or the one returned by [`Client::discover_access_point`].
#[derive(Debug, Clone)]
pub struct Client {
    http: reqwest::Client,
    base_url: String,
    signer: Signer,
}

impl Client {
    /// `base_url` can be a full URL (`https://host`) or a bare host (`host`).
    /// A bare host gets `https://`.
    pub fn new(base_url: impl AsRef<str>, signer: Signer) -> Self {
        Self {
            http: default_http(),
            base_url: normalize_base_url(base_url.as_ref()),
            signer,
        }
    }

    /// Reads `EXN_API_BASE_URL` (required) and the signer variables
    /// (see [`Signer::from_env`]).
    pub fn from_env() -> Result<Self, Error> {
        let base = std::env::var("EXN_API_BASE_URL").map_err(|_| {
            Error::Config("EXN_API_BASE_URL is not set. Copy the host from Key Management.".into())
        })?;
        Ok(Self::new(base, Signer::from_env()?))
    }

    /// Uses your own `reqwest::Client`, for example to set timeouts or a proxy.
    /// Give it a `User-Agent`: the API host blocks requests without one.
    pub fn with_http(mut self, http: reqwest::Client) -> Self {
        self.http = http;
        self
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// The WebSocket base for this host: `https` becomes `wss`, `http` becomes `ws`.
    pub fn ws_base_url(&self) -> String {
        if let Some(rest) = self.base_url.strip_prefix("https://") {
            format!("wss://{rest}")
        } else if let Some(rest) = self.base_url.strip_prefix("http://") {
            format!("ws://{rest}")
        } else {
            self.base_url.clone()
        }
    }

    /// Asks this host which host serves `account_id`
    /// (`GET /v1/trading/access-point?account_id=...`).
    ///
    /// The docs mark this endpoint as provisional, and it is not in the
    /// OpenAPI file. If the host in Key Management works, you do not need it.
    pub async fn discover_access_point(&self, account_id: &str) -> Result<AccessPoint, Error> {
        self.get(&format!("/v1/trading/access-point?account_id={account_id}"))
            .await
    }

    /// A copy of this client that sends requests to `access_point.access_point`.
    pub fn with_access_point(&self, access_point: &AccessPoint) -> Self {
        Self {
            http: self.http.clone(),
            base_url: normalize_base_url(&access_point.access_point),
            signer: self.signer.clone(),
        }
    }

    /// Signed `GET`. `path` includes the query string, for example
    /// `/v1/market-data/accounts/1/candles?instrument=XAUUSDm&from=...`.
    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T, Error> {
        self.send(Method::GET, path, None, "").await
    }

    /// Signed `POST` with a JSON body. Reuse the same `idempotency_key` to retry safely.
    pub async fn post<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
        idempotency_key: &str,
    ) -> Result<T, Error> {
        let body = serde_json::to_vec(body)?;
        self.send(Method::POST, path, Some(body), idempotency_key)
            .await
    }

    /// Signed `PATCH` with a JSON body.
    pub async fn patch<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
        idempotency_key: &str,
    ) -> Result<T, Error> {
        let body = serde_json::to_vec(body)?;
        self.send(Method::PATCH, path, Some(body), idempotency_key)
            .await
    }

    /// Signed `DELETE`, with an optional JSON body.
    pub async fn delete<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: Option<&B>,
        idempotency_key: &str,
    ) -> Result<T, Error> {
        let body = body.map(serde_json::to_vec).transpose()?;
        self.send(Method::DELETE, path, body, idempotency_key).await
    }

    /// Signs and sends one request. The body bytes sent are the bytes hashed.
    pub async fn send<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        body: Option<Vec<u8>>,
        idempotency_key: &str,
    ) -> Result<T, Error> {
        let bytes = body.as_deref().unwrap_or_default();
        let headers = self
            .signer
            .sign(method.as_str(), path, bytes, idempotency_key, now_ms())?;

        let mut req = self
            .http
            .request(method, format!("{}{}", self.base_url, path));
        for (name, value) in headers.pairs() {
            req = req.header(name, value);
        }
        if let Some(body) = body {
            req = req.header("Content-Type", "application/json").body(body);
        }

        let resp = req.send().await?;
        let status = resp.status();
        let text = resp.text().await?;
        if !status.is_success() {
            return Err(match serde_json::from_str::<ApiError>(&text) {
                Ok(error) => Error::Api {
                    status: status.as_u16(),
                    error,
                },
                Err(_) => Error::Http {
                    status: status.as_u16(),
                    body: text,
                },
            });
        }
        // Allow empty 2xx bodies for callers that ask for `()` or `serde_json::Value`.
        let text = if text.is_empty() { "null" } else { &text };
        Ok(serde_json::from_str(text)?)
    }
}

/// The API sits behind Cloudflare, which blocks requests with no `User-Agent`.
fn default_http() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!("exness-rs/", env!("CARGO_PKG_VERSION")))
        .build()
        .expect("default HTTP client")
}

fn normalize_base_url(base: &str) -> String {
    let base = base.trim().trim_end_matches('/');
    if base.contains("://") {
        base.to_owned()
    } else {
        format!("https://{base}")
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock is before 1970")
        .as_millis() as u64
}
