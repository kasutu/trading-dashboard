//! Sends one request to a local server and checks what arrives.

use std::io::{Read, Write};
use std::net::TcpListener;

use exness::{Client, Error, Signer};

// A fixed dummy key (32 bytes of 0x11). Never use it for a real account.
const TEST_PEM: &str = "-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIBERERERERERERERERERERERERERERERERERERERERER
-----END PRIVATE KEY-----";

/// Serves one response and returns the raw request it received.
fn serve_once(status: &str, body: &str) -> (String, std::thread::JoinHandle<String>) {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let handle = std::thread::spawn(move || {
        let (mut sock, _) = listener.accept().unwrap();
        let mut buf = vec![0; 16 * 1024];
        let n = sock.read(&mut buf).unwrap();
        sock.write_all(response.as_bytes()).unwrap();
        String::from_utf8_lossy(&buf[..n]).into_owned()
    });
    (url, handle)
}

fn client(url: String) -> Client {
    Client::new(url, Signer::from_pkcs8_pem("exnsk-test", TEST_PEM).unwrap())
}

#[tokio::test]
async fn get_sends_signed_headers() {
    let (url, server) = serve_once("200 OK", r#"{"account_id":"42"}"#);
    let v: serde_json::Value = client(url)
        .get("/v1/configuration/accounts/42/account")
        .await
        .unwrap();
    assert_eq!(v["account_id"], "42");

    let req = server.join().unwrap().to_ascii_lowercase();
    assert!(req.starts_with("get /v1/configuration/accounts/42/account http/1.1"));
    for h in [
        "exn-api-key: exnsk-test",
        "exn-idempotency-key:",
        "exn-timestamp:",
        "exn-sign-version: 1",
        "exn-data:",
        "exn-sign:",
        "user-agent: exness-rs/",
    ] {
        assert!(req.contains(h), "missing {h}");
    }
}

#[tokio::test]
async fn api_error_is_decoded() {
    let (url, server) = serve_once(
        "429 Too Many Requests",
        r#"{"code":3015,"error_message":"REQUEST_RATE_LIMIT"}"#,
    );
    let err = client(url)
        .get::<serde_json::Value>("/v1/configuration/accounts/42/limits")
        .await
        .unwrap_err();
    server.join().unwrap();
    match err {
        Error::Api { status, error } => {
            assert_eq!(status, 429);
            assert_eq!(error.code, 3015);
            assert_eq!(error.error_message, "REQUEST_RATE_LIMIT");
        }
        other => panic!("unexpected error: {other}"),
    }
}

#[test]
fn base_url_accepts_bare_host() {
    let signer = Signer::from_pkcs8_pem("k", TEST_PEM).unwrap();
    let c = Client::new("ap-qwerty123.trading.exness.com/", signer.clone());
    assert_eq!(c.base_url(), "https://ap-qwerty123.trading.exness.com");
    assert_eq!(c.ws_base_url(), "wss://ap-qwerty123.trading.exness.com");

    let c = Client::new("http://127.0.0.1:8080", signer);
    assert_eq!(c.base_url(), "http://127.0.0.1:8080");
    assert_eq!(c.ws_base_url(), "ws://127.0.0.1:8080");
}

#[tokio::test]
async fn discovery_returns_host_and_switches_client() {
    let (url, server) = serve_once(
        "200 OK",
        r#"{"access_point":"ap-qwerty123.trading.exness.com","account_id":42}"#,
    );
    let c = client(url);
    let ap = c.discover_access_point("42").await.unwrap();
    assert_eq!(ap.access_point, "ap-qwerty123.trading.exness.com");
    assert_eq!(ap.account_id, 42);

    let req = server.join().unwrap();
    assert!(req.starts_with("GET /v1/trading/access-point?account_id=42 HTTP/1.1"));
    assert_eq!(
        c.with_access_point(&ap).base_url(),
        "https://ap-qwerty123.trading.exness.com"
    );
}

/// Serves the responses in order, one per connection, and returns the raw requests.
fn serve_seq(
    responses: Vec<(&'static str, &'static str)>,
) -> (String, std::thread::JoinHandle<Vec<String>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let handle = std::thread::spawn(move || {
        let mut seen = Vec::new();
        for (status, body) in responses {
            let (mut sock, _) = listener.accept().unwrap();
            let mut buf = vec![0; 16 * 1024];
            let n = sock.read(&mut buf).unwrap();
            let resp = format!(
                "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            sock.write_all(resp.as_bytes()).unwrap();
            seen.push(String::from_utf8_lossy(&buf[..n]).into_owned());
        }
        seen
    });
    (url, handle)
}

const ACK: &str = r#"{"status":"accepted","operation_id":"9001","client_request_id":"order-0001"}"#;

#[tokio::test]
async fn open_position_posts_typed_body() {
    use exness::model::{AckStatus, OpenPositionRequest, Side};
    let (url, server) = serve_once("202 Accepted", ACK);
    let req = OpenPositionRequest::new("XAUUSDm", Side::Buy, "0.02").stop_loss("2590.5");
    let ack = client(url)
        .open_position("42", &req, "order-0001")
        .await
        .unwrap();
    assert_eq!(ack.status, AckStatus::Accepted);
    assert_eq!(ack.operation_id.as_deref(), Some("9001"));

    let raw = server.join().unwrap();
    assert!(raw.starts_with("POST /v1/trading/accounts/42/positions HTTP/1.1"));
    assert!(
        raw.to_ascii_lowercase()
            .contains("exn-idempotency-key: order-0001")
    );
    let body = raw.split("\r\n\r\n").nth(1).unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(body).unwrap(),
        serde_json::json!({"instrument":"XAUUSDm","side":"buy","volume":"0.02","stop_loss_price":"2590.5"})
    );
}

#[tokio::test]
async fn close_position_sends_query_and_no_body() {
    use exness::model::ClosePosition;
    let (url, server) = serve_once("202 Accepted", ACK);
    let opts = ClosePosition {
        volume: Some("0.01".into()),
        ..Default::default()
    };
    client(url)
        .close_position("42", "77", &opts, "close-0001")
        .await
        .unwrap();
    let raw = server.join().unwrap();
    assert!(raw.starts_with("DELETE /v1/trading/accounts/42/positions/77?volume=0.01 HTTP/1.1"));
    assert!(raw.ends_with("\r\n\r\n"), "unexpected body: {raw}");
}

#[tokio::test]
async fn candles_builds_query_and_decodes() {
    use exness::model::{AnyCandle, CandleQuery, Timeframe};
    let (url, server) = serve_once(
        "200 OK",
        r#"{"candles":[{"time":"2026-01-01T00:00:00Z","open":1,"high":2,"low":0.5,"close":1.5,"volume":3}]}"#,
    );
    let q = CandleQuery::new("XAUUSDm", Timeframe::M15, "2026-01-01T00:00:00Z").count(-100);
    let h = client(url).candles("42", &q).await.unwrap();
    let AnyCandle::Single(c) = &h.candles[0] else {
        panic!("wrong shape")
    };
    assert_eq!(c.close, 1.5);
    let raw = server.join().unwrap();
    assert!(raw.starts_with(
        "GET /v1/market-data/accounts/42/candles?instrument=XAUUSDm&timeframe=M15&from=2026-01-01T00:00:00Z&count=-100 HTTP/1.1"
    ));
}

#[tokio::test]
async fn wait_operation_polls_until_final() {
    use exness::model::OperationState;
    use std::time::Duration;
    let pending = r#"{"operation_id":"9001","status":"pending","created_at":"t","updated_at":"t"}"#;
    let done = r#"{"operation_id":"9001","status":"confirmed","created_at":"t","updated_at":"t2"}"#;
    let (url, server) = serve_seq(vec![("200 OK", pending), ("200 OK", done)]);
    let s = client(url)
        .wait_operation(
            "42",
            "9001",
            Duration::from_millis(10),
            Duration::from_secs(5),
        )
        .await
        .unwrap();
    assert_eq!(s.status, OperationState::Confirmed);
    let reqs = server.join().unwrap();
    assert_eq!(reqs.len(), 2);
    assert!(reqs[1].starts_with("GET /v1/trading/accounts/42/operations/9001 HTTP/1.1"));
}

#[tokio::test]
async fn wait_operation_times_out() {
    use std::time::Duration;
    let pending = r#"{"operation_id":"1","status":"pending","created_at":"t","updated_at":"t"}"#;
    let (url, server) = serve_seq(vec![("200 OK", pending), ("200 OK", pending)]);
    let err = client(url)
        .wait_operation(
            "42",
            "1",
            Duration::from_millis(500),
            Duration::from_millis(50),
        )
        .await
        .unwrap_err();
    assert!(matches!(err, Error::Timeout(_)), "{err}");
    server.join().unwrap();
}
