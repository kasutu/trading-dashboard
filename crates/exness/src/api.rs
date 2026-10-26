//! Typed methods for every REST endpoint in `openapi/trading.public.yaml`.
//!
//! Each trading call returns an [`AckResponse`] (HTTP 202). The trade result
//! comes later: as a `transaction_event` on the events stream, or from
//! [`Client::operation_status`]. [`Client::wait_operation`] polls for it.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use reqwest::Method;

use crate::model::*;
use crate::{Client, Error};

/// A fresh idempotency key, for example `exn-1767225600000-1a2b-3`.
///
/// Unique per process: time in ms, process ID, and a counter. Keep the key to
/// retry the same request safely; the server then returns the first result.
pub fn new_idempotency_key() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("exn-{ms}-{:x}-{n}", std::process::id())
}

impl Client {
    // ---------- Configuration ----------

    pub async fn account_details(&self, account_id: &str) -> Result<AccountDetails, Error> {
        self.get(&format!(
            "/v1/configuration/accounts/{}/account",
            enc(account_id)
        ))
        .await
    }

    pub async fn instruments(&self, account_id: &str) -> Result<InstrumentList, Error> {
        self.get(&format!(
            "/v1/configuration/accounts/{}/instruments",
            enc(account_id)
        ))
        .await
    }

    pub async fn instrument_conditions(
        &self,
        account_id: &str,
        instrument: &str,
    ) -> Result<InstrumentConditions, Error> {
        self.get(&format!(
            "/v1/configuration/accounts/{}/instruments/{}/conditions",
            enc(account_id),
            enc(instrument)
        ))
        .await
    }

    pub async fn limits(&self, account_id: &str) -> Result<LimitsResponse, Error> {
        self.get(&format!(
            "/v1/configuration/accounts/{}/limits",
            enc(account_id)
        ))
        .await
    }

    // ---------- Market data ----------

    pub async fn candles(&self, account_id: &str, q: &CandleQuery) -> Result<CandleHistory, Error> {
        let count = q.count.map(|c| c.to_string());
        let query = query(&[
            ("instrument", Some(q.instrument.as_str())),
            ("price_type", q.price_type.map(PriceType::as_str)),
            ("timeframe", Some(q.timeframe.as_str())),
            ("from", Some(q.from.as_str())),
            ("to", q.to.as_deref()),
            ("count", count.as_deref()),
        ]);
        self.get(&format!(
            "/v1/market-data/accounts/{}/candles{query}",
            enc(account_id)
        ))
        .await
    }

    // ---------- Trading ----------

    pub async fn snapshot(&self, account_id: &str) -> Result<TradingStateSnapshot, Error> {
        self.get(&format!(
            "/v1/trading/accounts/{}/snapshot",
            enc(account_id)
        ))
        .await
    }

    /// Opens a position at market.
    pub async fn open_position(
        &self,
        account_id: &str,
        req: &OpenPositionRequest,
        idempotency_key: &str,
    ) -> Result<AckResponse, Error> {
        self.post(
            &format!("/v1/trading/accounts/{}/positions", enc(account_id)),
            req,
            idempotency_key,
        )
        .await
    }

    /// Closes a position, fully or in part (see [`ClosePosition`]).
    pub async fn close_position(
        &self,
        account_id: &str,
        position_id: &str,
        opts: &ClosePosition,
        idempotency_key: &str,
    ) -> Result<AckResponse, Error> {
        let query = query(&[
            ("volume", opts.volume.as_deref()),
            ("price", opts.price.as_deref()),
            ("deviation", opts.deviation.as_deref()),
            ("close_by_position_id", opts.close_by_position_id.as_deref()),
        ]);
        let path = format!(
            "/v1/trading/accounts/{}/positions/{}{query}",
            enc(account_id),
            enc(position_id)
        );
        self.send(Method::DELETE, &path, None, idempotency_key)
            .await
    }

    /// Places a limit, stop, or SL/TP order.
    pub async fn place_order(
        &self,
        account_id: &str,
        order: &NewPendingOrder,
        idempotency_key: &str,
    ) -> Result<AckResponse, Error> {
        self.post(
            &format!("/v1/trading/accounts/{}/orders", enc(account_id)),
            order,
            idempotency_key,
        )
        .await
    }

    pub async fn modify_order(
        &self,
        account_id: &str,
        order_id: &str,
        changes: &ModifyOrderRequest,
        idempotency_key: &str,
    ) -> Result<AckResponse, Error> {
        self.patch(
            &format!(
                "/v1/trading/accounts/{}/orders/{}",
                enc(account_id),
                enc(order_id)
            ),
            changes,
            idempotency_key,
        )
        .await
    }

    pub async fn cancel_order(
        &self,
        account_id: &str,
        order_id: &str,
        idempotency_key: &str,
    ) -> Result<AckResponse, Error> {
        let path = format!(
            "/v1/trading/accounts/{}/orders/{}",
            enc(account_id),
            enc(order_id)
        );
        self.send(Method::DELETE, &path, None, idempotency_key)
            .await
    }

    pub async fn operation_status(
        &self,
        account_id: &str,
        operation_id: &str,
    ) -> Result<OperationStatus, Error> {
        self.get(&format!(
            "/v1/trading/accounts/{}/operations/{}",
            enc(account_id),
            enc(operation_id)
        ))
        .await
    }

    /// Polls [`Client::operation_status`] every `interval` until the status is
    /// final, or returns [`Error::Timeout`] after `timeout`.
    ///
    /// Use this when the `transaction_event` does not arrive on the stream.
    pub async fn wait_operation(
        &self,
        account_id: &str,
        operation_id: &str,
        interval: Duration,
        timeout: Duration,
    ) -> Result<OperationStatus, Error> {
        let deadline = Instant::now() + timeout;
        loop {
            let status = self.operation_status(account_id, operation_id).await?;
            if status.is_final() {
                return Ok(status);
            }
            let now = Instant::now();
            if now >= deadline {
                return Err(Error::Timeout(format!(
                    "operation {operation_id} still pending after {timeout:?}"
                )));
            }
            tokio::time::sleep(interval.min(deadline - now)).await;
        }
    }

    // ---------- History ----------

    pub async fn orders_history(
        &self,
        account_id: &str,
        q: &HistoryQuery,
    ) -> Result<HistoryPage<OrderHistoryItem>, Error> {
        self.get(&format!(
            "/v1/history/accounts/{}/orders{}",
            enc(account_id),
            history_query(q, ("order_state", q.order_state.map(OrderState::as_str)))
        ))
        .await
    }

    pub async fn deals_history(
        &self,
        account_id: &str,
        q: &HistoryQuery,
    ) -> Result<HistoryPage<DealHistoryItem>, Error> {
        self.get(&format!(
            "/v1/history/accounts/{}/deals{}",
            enc(account_id),
            history_query(q, ("deal_type", q.deal_type.map(DealType::as_str)))
        ))
        .await
    }
}

fn history_query(q: &HistoryQuery, filter: (&str, Option<&str>)) -> String {
    let limit = q.limit.map(|l| l.to_string());
    query(&[
        ("from", q.from.as_deref()),
        ("to", q.to.as_deref()),
        ("cursor", q.cursor.as_deref()),
        ("limit", limit.as_deref()),
        filter,
        ("instrument", q.instrument.as_deref()),
    ])
}

/// `?a=1&b=2` from the pairs that have a value, or `""` if none do.
/// The string is signed as built, so the order here is the order sent.
fn query(pairs: &[(&str, Option<&str>)]) -> String {
    let parts: Vec<String> = pairs
        .iter()
        .filter_map(|(k, v)| v.map(|v| format!("{k}={}", enc(v))))
        .collect();
    if parts.is_empty() {
        String::new()
    } else {
        format!("?{}", parts.join("&"))
    }
}

/// Percent-encodes everything except RFC 3986 unreserved characters and `:`.
/// `:` stays as is so RFC 3339 times read naturally; `+` in an offset is encoded.
fn enc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-._~:".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_skips_empty_and_encodes() {
        assert_eq!(query(&[("a", None)]), "");
        assert_eq!(
            query(&[
                ("from", Some("2026-01-01T00:00:00+02:00")),
                ("x", None),
                ("i", Some("A B"))
            ]),
            "?from=2026-01-01T00:00:00%2B02:00&i=A%20B"
        );
    }

    #[test]
    fn idempotency_keys_are_unique_and_valid() {
        let a = new_idempotency_key();
        let b = new_idempotency_key();
        assert_ne!(a, b);
        assert!((5..=128).contains(&a.len()));
        assert!(
            a.bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"._-~".contains(&c))
        );
    }
}
