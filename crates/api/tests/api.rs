//! Integration tests against a real Postgres.
//!
//! Start one with:
//! `docker run -d --rm --name jurno-api-test-pg -p 55432:5432 -e POSTGRES_PASSWORD=pg postgres:17`
//! or point `TEST_DATABASE_URL` at another server. Each test gets its own database.

use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

const COOKIE: &str = "better-auth.session_token=tok_alice.signature";
const BOB_COOKIE: &str = "__Secure-better-auth.session_token=tok_bob.sig%3D";

struct TestApp {
    app: Router,
    pool: PgPool,
}

/// Creates a fresh database, runs migrations, and fakes the Better Auth tables
/// with two users (alice, bob) and a live session each.
async fn setup() -> TestApp {
    let base = std::env::var("TEST_DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:pg@localhost:55432".into());
    let admin = PgPool::connect(&format!("{base}/postgres"))
        .await
        .expect("connect to Postgres");
    let name = format!("jurno_test_{}", Uuid::new_v4().simple());
    sqlx::query(&format!("create database {name}"))
        .execute(&admin)
        .await
        .unwrap();
    admin.close().await;

    let pool = api::db::connect(&format!("{base}/{name}")).await.unwrap();
    for sql in [
        r#"create table "user" ("id" text primary key, "name" text not null, "username" text, "displayUsername" text)"#,
        r#"create table "session" ("id" text primary key, "token" text not null unique,
            "userId" text not null, "expiresAt" timestamptz not null)"#,
        r#"insert into "user" values ('u_alice', 'Alice', 'alice', 'Alice.T'), ('u_bob', 'Bob', null, null)"#,
        r#"insert into "session" values
            ('s1', 'tok_alice', 'u_alice', now() + interval '1 day'),
            ('s2', 'tok_bob', 'u_bob', now() + interval '1 day'),
            ('s3', 'tok_old', 'u_alice', now() - interval '1 minute')"#,
    ] {
        sqlx::query(sql).execute(&pool).await.unwrap();
    }
    TestApp {
        app: api::app(pool.clone()),
        pool,
    }
}

impl TestApp {
    /// Puts a user on a plan (free, espresso, latte).
    async fn set_plan(&self, user: &str, plan: &str) {
        sqlx::query(
            "insert into profiles (user_id, plan) values ($1, $2)
             on conflict (user_id) do update set plan = excluded.plan",
        )
        .bind(user)
        .bind(plan)
        .execute(&self.pool)
        .await
        .unwrap();
    }

    async fn send(
        &self,
        method: Method,
        path: &str,
        cookie: Option<&str>,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let mut req = Request::builder().method(method).uri(path);
        if let Some(c) = cookie {
            req = req.header("cookie", c);
        }
        let req = match body {
            Some(b) => req
                .header("content-type", "application/json")
                .body(Body::from(b.to_string())),
            None => req.body(Body::empty()),
        }
        .unwrap();
        let res = self.app.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let bytes = res.into_body().collect().await.unwrap().to_bytes();
        let value = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap()
        };
        (status, value)
    }

    async fn get(&self, path: &str) -> (StatusCode, Value) {
        self.send(Method::GET, path, Some(COOKIE), None).await
    }

    async fn post(&self, path: &str, body: Value) -> (StatusCode, Value) {
        self.send(Method::POST, path, Some(COOKIE), Some(body))
            .await
    }

    async fn new_account(&self) -> String {
        let (s, a) = self.post("/api/accounts", json!({ "name": "Main" })).await;
        assert_eq!(s, StatusCode::OK, "{a}");
        a["id"].as_str().unwrap().to_string()
    }
}

fn mapping() -> Value {
    json!({ "columns": { "openTime": "open", "closeTime": "close", "profit": "profit" }, "timestampsTz": "UTC" })
}

#[tokio::test]
async fn health_is_public() {
    let t = setup().await;
    let (s, v) = t.send(Method::GET, "/api/health", None, None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(v, json!({ "ok": true }));
}

#[tokio::test]
async fn needs_a_live_session() {
    let t = setup().await;
    let signed_out = json!({ "error": "Sign in to continue." });
    for cookie in [
        None,
        Some("better-auth.session_token=tok_old.sig"),
        Some("better-auth.session_token=nope.sig"),
        Some("other=tok_alice"),
    ] {
        let (s, v) = t.send(Method::GET, "/api/me", cookie, None).await;
        assert_eq!(s, StatusCode::UNAUTHORIZED, "{cookie:?}");
        assert_eq!(v, signed_out);
    }
}

#[tokio::test]
async fn me_creates_the_profile() {
    let t = setup().await;
    let (s, v) = t.get("/api/me").await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(
        v,
        json!({ "id": "u_alice", "username": "Alice.T", "plan": "free" })
    );
    let n: i64 = sqlx::query_scalar("select count(*) from profiles")
        .fetch_one(&t.pool)
        .await
        .unwrap();
    assert_eq!(n, 1);

    // Second call keeps one row. Bob has no username, so the name is used.
    t.get("/api/me").await;
    let (_, bob) = t.send(Method::GET, "/api/me", Some(BOB_COOKIE), None).await;
    assert_eq!(bob["username"], "Bob");
    let n: i64 = sqlx::query_scalar("select count(*) from profiles")
        .fetch_one(&t.pool)
        .await
        .unwrap();
    assert_eq!(n, 2);
}

#[tokio::test]
async fn accounts_crud() {
    let t = setup().await;
    let (s, a) = t
        .post(
            "/api/accounts",
            json!({ "name": " Main ", "broker": "Exness" }),
        )
        .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(a["name"], "Main");
    assert_eq!(a["broker"], "Exness");
    assert_eq!(a["currency"], "USD");
    assert_eq!(a["trades"], 0);
    assert!(a["createdAt"].is_string());
    let id = a["id"].as_str().unwrap();

    let (s, v) = t.post("/api/accounts", json!({ "name": "  " })).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert_eq!(v["error"], "Give the account a name.");
    let (s, _) = t.post("/api/accounts", json!({ "broker": "x" })).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);

    let path = format!("/api/accounts/{id}");
    let (s, a) = t
        .send(
            Method::PATCH,
            &path,
            Some(COOKIE),
            Some(json!({ "currency": "eur" })),
        )
        .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(
        (
            a["name"].as_str(),
            a["broker"].as_str(),
            a["currency"].as_str()
        ),
        (Some("Main"), Some("Exness"), Some("EUR"))
    );
    let (_, a) = t
        .send(
            Method::PATCH,
            &path,
            Some(COOKIE),
            Some(json!({ "name": "Gold", "broker": null })),
        )
        .await;
    assert_eq!(a["name"], "Gold");
    assert_eq!(a["broker"], Value::Null);

    let (_, list) = t.get("/api/accounts").await;
    assert_eq!(list.as_array().unwrap().len(), 1);

    let (s, _) = t.send(Method::DELETE, &path, Some(COOKIE), None).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (_, list) = t.get("/api/accounts").await;
    assert_eq!(list, json!([]));
}

#[tokio::test]
async fn accounts_of_other_users_are_not_found() {
    let t = setup().await;
    let id = t.new_account().await;
    let bob = Some(BOB_COOKIE);
    let (_, list) = t.send(Method::GET, "/api/accounts", bob, None).await;
    assert_eq!(list, json!([]));

    let path = format!("/api/accounts/{id}");
    for (method, path, body) in [
        (Method::PATCH, path.clone(), Some(json!({ "name": "Mine" }))),
        (Method::DELETE, path.clone(), None),
        (Method::GET, format!("{path}/imports"), None),
        (
            Method::POST,
            format!("{path}/imports"),
            Some(json!({ "fileName": "a.csv", "csv": "", "mapping": mapping() })),
        ),
        (Method::GET, format!("{path}/analytics"), None),
        (Method::GET, format!("{path}/trades"), None),
        (Method::GET, "/api/accounts/not-a-uuid/trades".into(), None),
    ] {
        let (s, v) = t.send(method.clone(), &path, bob, body).await;
        assert_eq!(s, StatusCode::NOT_FOUND, "{method} {path}");
        assert_eq!(v["error"], "This account does not exist.");
    }
    // Still there for the owner.
    let (_, imports) = t.get(&format!("/api/accounts/{id}/imports")).await;
    assert_eq!(imports, json!([]));
}

#[tokio::test]
async fn mappings_crud() {
    let t = setup().await;
    t.set_plan("u_alice", "espresso").await;
    let (s, m) = t
        .post(
            "/api/mappings",
            json!({ "name": "MT5", "mapping": mapping() }),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{m}");
    assert_eq!(m["name"], "MT5");
    assert_eq!(m["mapping"], mapping());
    let id = m["id"].as_str().unwrap();

    let (s, v) = t
        .post(
            "/api/mappings",
            json!({ "name": "x", "mapping": { "columns": {}, "timestampsTz": "Mars/Base" } }),
        )
        .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert!(v["error"].as_str().unwrap().contains("Mars/Base"));
    let (s, _) = t.post("/api/mappings", json!({ "name": "x", "mapping": { "columns": { "nope": "a" }, "timestampsTz": "UTC" } })).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);

    let (_, list) = t.get("/api/mappings").await;
    assert_eq!(list.as_array().unwrap().len(), 1);
    let (_, bob_list) = t
        .send(Method::GET, "/api/mappings", Some(BOB_COOKIE), None)
        .await;
    assert_eq!(bob_list, json!([]));

    let path = format!("/api/mappings/{id}");
    let (s, _) = t.send(Method::DELETE, &path, Some(BOB_COOKIE), None).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    let (s, _) = t.send(Method::DELETE, &path, Some(COOKIE), None).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (s, _) = t.send(Method::DELETE, &path, Some(COOKIE), None).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn query_validation() {
    let t = setup().await;
    let id = t.new_account().await;
    for (query, error) in [
        ("tz=Mars/Base", "\"Mars/Base\" is not a known timezone. Use an IANA name such as \"UTC\" or \"Europe/London\"."),
        ("range=14", "Use 7, 30, 90 or all for \"range\"."),
        ("side=long", "Use buy or sell for \"side\"."),
    ] {
        for route in ["analytics", "trades"] {
            let (s, v) = t.get(&format!("/api/accounts/{id}/{route}?{query}")).await;
            assert_eq!(s, StatusCode::BAD_REQUEST, "{route}?{query}");
            assert_eq!(v["error"], error);
        }
    }
    for (query, error) in [
        ("from=2026-13-01", "Use yyyy-mm-dd for \"from\"."),
        ("to=yesterday", "Use yyyy-mm-dd for \"to\"."),
        ("page=-1", "\"page\" must be a whole number."),
        ("pageSize=ten", "\"pageSize\" must be a whole number."),
    ] {
        let (s, v) = t.get(&format!("/api/accounts/{id}/trades?{query}")).await;
        assert_eq!(s, StatusCode::BAD_REQUEST, "{query}");
        assert_eq!(v["error"], error);
    }
}

#[tokio::test]
async fn bad_json_body_is_a_json_error() {
    let t = setup().await;
    let req = Request::post("/api/accounts")
        .header("cookie", COOKIE)
        .header("content-type", "application/json")
        .body(Body::from("{"))
        .unwrap();
    let res = t.app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    let v: Value =
        serde_json::from_slice(&res.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(v["error"]
        .as_str()
        .unwrap()
        .starts_with("The request body is not valid"));
}

#[tokio::test]
async fn trades_round_trip_through_the_table() {
    let t = setup().await;
    let id: Uuid = t.new_account().await.parse().unwrap();
    let trade = |ticket: &str, profit: f64, sl: Option<f64>| engine::Trade {
        ticket: ticket.into(),
        open: "2026-08-03T02:25:00Z".parse().unwrap(),
        close: "2026-08-03T02:46:02Z".parse().unwrap(),
        side: engine::Side::Sell,
        lots: 0.5,
        symbol: "XAUUSD".into(),
        open_price: 2400.5,
        close_price: 2401.2,
        sl,
        tp: None,
        commission: -0.5,
        swap: 0.0,
        profit,
        net: ((profit - 0.5) * 100.0_f64).round() / 100.0,
        reason: "sl".into(),
    };
    let mut tx = t.pool.begin().await.unwrap();
    api::trade_row::upsert_trades(
        &mut tx,
        id,
        &[trade("1", 5.24, Some(2399.0)), trade("2", -3.0, None)],
    )
    .await
    .unwrap();
    // Same ticket again replaces the row.
    api::trade_row::upsert_trades(&mut tx, id, &[trade("2", -4.0, None)])
        .await
        .unwrap();
    tx.commit().await.unwrap();

    let loaded = api::trade_row::load_trades(&t.pool, id).await.unwrap();
    assert_eq!(
        loaded,
        vec![trade("1", 5.24, Some(2399.0)), trade("2", -4.0, None)]
    );
    let (_, accounts) = t.get("/api/accounts").await;
    assert_eq!(accounts[0]["trades"], 2);
}

// --- Tests that need the engine -------------------------------------------------

const WINNING: &str = include_str!("../../engine/tests/fixtures/exness-winning.csv");

#[tokio::test]
async fn presets_are_public() {
    let t = setup().await;
    let (s, v) = t.send(Method::GET, "/api/presets", None, None).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(v["exness"], json!(engine::exness_mapping()));
}

#[tokio::test]
async fn import_counts_added_and_duplicates() {
    let t = setup().await;
    let id = t.new_account().await;
    let path = format!("/api/accounts/{id}/imports");
    let body =
        json!({ "fileName": "winning.csv", "csv": WINNING, "mapping": engine::exness_mapping() });
    let rows = engine::parse_csv(WINNING, &engine::exness_mapping())
        .unwrap()
        .trades
        .len() as i64;

    let (s, first) = t.post(&path, body.clone()).await;
    assert_eq!(s, StatusCode::OK, "{first}");
    assert_eq!(first["fileName"], "winning.csv");
    assert_eq!(first["added"], rows);
    assert_eq!(first["duplicates"], 0);

    let (_, second) = t.post(&path, body).await;
    assert_eq!(second["added"], 0);
    assert_eq!(second["duplicates"], rows);

    let (_, imports) = t.get(&path).await;
    assert_eq!(imports[0]["id"], second["id"], "newest first");
    let (_, accounts) = t.get("/api/accounts").await;
    assert_eq!(accounts[0]["trades"], rows);
}

#[tokio::test]
async fn import_parse_errors_are_422() {
    let t = setup().await;
    let id = t.new_account().await;
    let path = format!("/api/accounts/{id}/imports");
    let mut m = engine::exness_mapping();
    m.columns.insert(engine::Field::Profit, "pnl".into());
    let (s, v) = t
        .post(
            &path,
            json!({ "fileName": "a.csv", "csv": WINNING, "mapping": m }),
        )
        .await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(v["error"], "The column \"pnl\" is not in the file.");
}

#[tokio::test]
async fn analytics_and_trades() {
    let t = setup().await;
    let id = t.new_account().await;

    let (_, v) = t.get(&format!("/api/accounts/{id}/analytics")).await;
    assert_eq!(v, json!({ "empty": true }));

    let body = json!({ "fileName": "w.csv", "csv": WINNING, "mapping": engine::exness_mapping() });
    let (_, import) = t.post(&format!("/api/accounts/{id}/imports"), body).await;
    let added = import["added"].as_u64().unwrap();

    let (s, v) = t
        .get(&format!(
            "/api/accounts/{id}/analytics?range=all&tz=Asia/Manila"
        ))
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["summary"]["trades"], added);
    let (_, v) = t
        .get(&format!("/api/accounts/{id}/analytics?symbol=NOPE"))
        .await;
    assert_eq!(v, json!({ "empty": true }));

    let (s, v) = t
        .get(&format!("/api/accounts/{id}/trades?page=1&pageSize=10"))
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["total"], added);
    assert_eq!(v["rows"].as_array().unwrap().len(), 10);
    assert!(v["rows"][0]["day"].is_string());
    assert!(v["rows"][0]["ticket"].is_string());
}

#[tokio::test]
async fn free_plan_limits() {
    let t = setup().await;
    let id = t.new_account().await;
    let body = json!({ "fileName": "w.csv", "csv": WINNING, "mapping": engine::exness_mapping() });
    t.post(&format!("/api/accounts/{id}/imports"), body).await;

    // Free: core analytics only, marked locked.
    let (s, v) = t.get(&format!("/api/accounts/{id}/analytics")).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["locked"], true);
    assert!(v["summary"].is_object() && v["daily"].is_array() && v["byLots"].is_array());
    for key in api::plan::PAID_FIELDS {
        assert!(v.get(key).is_none(), "free plan got {key}");
    }

    // Free: one account, no saved mappings.
    let (s, v) = t.post("/api/accounts", json!({ "name": "Second" })).await;
    assert_eq!(s, StatusCode::FORBIDDEN, "{v}");
    let (s, _) = t
        .post(
            "/api/mappings",
            json!({ "name": "MT5", "mapping": mapping() }),
        )
        .await;
    assert_eq!(s, StatusCode::FORBIDDEN);

    // Latte: everything, up to 5 accounts.
    t.set_plan("u_alice", "latte").await;
    let (_, v) = t.get(&format!("/api/accounts/{id}/analytics")).await;
    assert!(v.get("locked").is_none());
    assert!(v["byHour"].is_array() && v["optimization"].is_object());
    for n in 2..=5 {
        let (s, v) = t
            .post("/api/accounts", json!({ "name": format!("A{n}") }))
            .await;
        assert_eq!(s, StatusCode::OK, "{v}");
    }
    let (s, _) = t.post("/api/accounts", json!({ "name": "A6" })).await;
    assert_eq!(s, StatusCode::FORBIDDEN);

    // Owner: no account limit.
    t.set_plan("u_alice", "owner").await;
    let (s, v) = t.post("/api/accounts", json!({ "name": "A6" })).await;
    assert_eq!(s, StatusCode::OK, "{v}");
}
