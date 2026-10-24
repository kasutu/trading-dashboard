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

    // Risk limits: set, check, clear.
    assert_eq!(a["risk"], Value::Null);
    let risk = json!({ "kind": "percent", "daily": 2.0, "perTrade": 1.0, "maxTrades": 3 });
    let (s, a) = t.send(Method::PATCH, &path, Some(COOKIE), Some(json!({ "risk": risk }))).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(a["risk"], risk);
    let (s, _) = t
        .send(Method::PATCH, &path, Some(COOKIE), Some(json!({ "risk": { "kind": "percent", "daily": 150, "perTrade": null, "maxTrades": null } })))
        .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (_, a) = t.send(Method::PATCH, &path, Some(COOKIE), Some(json!({ "name": "Gold" }))).await;
    assert_eq!(a["risk"], risk, "a patch without risk keeps it");
    let (_, a) = t.send(Method::PATCH, &path, Some(COOKIE), Some(json!({ "risk": null }))).await;
    assert_eq!(a["risk"], Value::Null);

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
    let (_, flow) = t
        .post(
            &format!("/api/accounts/{id}/cash-flows"),
            json!({ "occurredAt": "2026-08-01T09:00:00Z", "kind": "deposit", "amount": 1 }),
        )
        .await;
    let flow = flow["id"].as_str().unwrap();
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
        (Method::GET, format!("{path}/cash-flows"), None),
        (
            Method::POST,
            format!("{path}/cash-flows"),
            Some(json!({ "occurredAt": "2026-08-01T09:00:00Z", "kind": "deposit", "amount": 1 })),
        ),
        (Method::DELETE, format!("{path}/cash-flows/{flow}"), None),
        (
            Method::POST,
            format!("{path}/cash-flows/bulk"),
            Some(json!({ "ids": [flow], "action": "delete" })),
        ),
        (Method::GET, "/api/accounts/not-a-uuid/trades".into(), None),
    ] {
        let (s, v) = t.send(method.clone(), &path, bob, body).await;
        assert_eq!(s, StatusCode::NOT_FOUND, "{method} {path}");
        assert_eq!(v["error"], "This account does not exist.");
    }
    // Still there for the owner.
    let (_, imports) = t.get(&format!("/api/accounts/{id}/imports")).await;
    assert_eq!(imports, json!([]));
    let (_, flows) = t.get(&format!("/api/accounts/{id}/cash-flows")).await;
    assert_eq!(flows["rows"].as_array().unwrap().len(), 1);
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
    assert!(v["byWeek"].is_array() && v["byMonth"].is_array() && v["bestLots"].is_array());
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

#[tokio::test]
async fn admin_commands_set_plans() {
    let t = setup().await;
    let run = |args: &[&str]| {
        let args: Vec<String> = args.iter().map(|s| s.to_string()).collect();
        let pool = t.pool.clone();
        async move { api::admin::run(&pool, &args).await }
    };
    // Username match ignores case, as Better Auth stores it in lower case.
    assert!(run(&["plan", "ALICE", "espresso"])
        .await
        .unwrap()
        .contains("espresso"));
    assert!(run(&["owner", "alice"]).await.unwrap().contains("owner"));
    assert_eq!(
        api::plan::Plan::of(&t.pool, "u_alice").await.unwrap(),
        api::plan::Plan::Owner
    );
    assert!(run(&["plan", "alice", "gold"]).await.is_err());
    assert!(run(&["owner", "nobody"])
        .await
        .unwrap_err()
        .contains("No user named nobody"));
    assert!(run(&["unknown"]).await.is_err());
}

#[tokio::test]
async fn admin_delete_removes_the_user_and_their_data() {
    let t = setup().await;
    sqlx::query(r#"create table "account" ("id" text primary key, "userId" text not null)"#)
        .execute(&t.pool)
        .await
        .unwrap();
    let id = t.new_account().await;
    let body = json!({ "fileName": "w.csv", "csv": WINNING, "mapping": engine::exness_mapping() });
    t.post(&format!("/api/accounts/{id}/imports"), body).await;
    t.set_plan("u_alice", "latte").await;
    t.post("/api/journal/setups", json!({ "name": "Breakout" }))
        .await;
    t.get("/api/journal/tags").await;

    let out = api::admin::delete_user(&t.pool, "Alice").await.unwrap();
    assert!(out.contains("Deleted"));
    for (table, col) in [
        ("trading_accounts", "user_id"),
        ("profiles", "user_id"),
        ("setups", "user_id"),
        ("mistake_tags", "user_id"),
        ("\"session\"", "\"userId\""),
        ("\"user\"", "id"),
    ] {
        let n: i64 = sqlx::query_scalar(&format!(
            "select count(*) from {table} where {col} = 'u_alice'"
        ))
        .fetch_one(&t.pool)
        .await
        .unwrap();
        assert_eq!(n, 0, "{table} still has alice");
    }
    let trades: i64 = sqlx::query_scalar("select count(*) from trades")
        .fetch_one(&t.pool)
        .await
        .unwrap();
    assert_eq!(trades, 0);
    // Bob is untouched.
    let bob: i64 = sqlx::query_scalar(r#"select count(*) from "user" where id = 'u_bob'"#)
        .fetch_one(&t.pool)
        .await
        .unwrap();
    assert_eq!(bob, 1);
    assert!(api::admin::delete_user(&t.pool, "nobody").await.is_err());
}

#[tokio::test]
async fn partial_closes_with_the_same_ticket_are_kept() {
    let t = setup().await;
    let id = t.new_account().await;
    // One 0.05 position closed in two parts: same ticket, different close time and lots.
    let csv = "ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,profit,close_reason\n\
266462226,2026-10-18T20:44:09,2026-10-19T02:24:17,buy,0.03,BTCUSDm,80775.9,82270.36,80815.23,83400,0,0,44.83,user\n\
266462226,2026-10-18T20:44:09,2026-10-19T10:25:41,buy,0.02,BTCUSDm,80775.9,82390.05,80815.23,83400,0,0,32.28,user\n";
    let body = json!({ "fileName": "p.csv", "csv": csv, "mapping": engine::exness_mapping() });
    let (s, v) = t
        .post(&format!("/api/accounts/{id}/imports"), body.clone())
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(
        (v["added"].as_u64(), v["duplicates"].as_u64()),
        (Some(2), Some(0))
    );

    let (_, a) = t.get(&format!("/api/accounts/{id}/analytics")).await;
    assert_eq!(a["summary"]["trades"], 2);
    assert!((a["summary"]["net"].as_f64().unwrap() - 77.11).abs() < 0.001);

    // Importing the same file again adds nothing.
    let (_, v) = t.post(&format!("/api/accounts/{id}/imports"), body).await;
    assert_eq!(
        (v["added"].as_u64(), v["duplicates"].as_u64()),
        (Some(0), Some(2))
    );
}

#[tokio::test]
async fn cash_flows_crud_and_summary() {
    let t = setup().await;
    let id = t.new_account().await;
    let path = format!("/api/accounts/{id}/cash-flows");

    let (s, v) = t.get(&path).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["rows"], json!([]));
    assert_eq!(v["summary"]["net"], 0.0);
    assert_eq!(v["daily"], json!([]));

    let (s, first) = t
        .post(
            &path,
            json!({ "occurredAt": "2026-08-01T09:00:00Z", "kind": "deposit", "amount": 500, "note": " First funding " }),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{first}");
    assert_eq!(first["kind"], "deposit");
    assert_eq!(first["amount"], 500.0);
    assert_eq!(first["note"], "First funding");
    assert_eq!(first["occurredAt"], "2026-08-01T09:00:00Z");
    assert!(first["id"].is_string() && first["createdAt"].is_string());
    // 20:00 UTC is Aug 2 in Manila. An empty note is stored as null.
    for body in [
        json!({ "occurredAt": "2026-08-01T20:00:00Z", "kind": "deposit", "amount": 100.5, "note": "" }),
        json!({ "occurredAt": "2026-09-10T08:00:00Z", "kind": "withdrawal", "amount": 150 }),
    ] {
        let (s, v) = t.post(&path, body).await;
        assert_eq!(s, StatusCode::OK, "{v}");
        assert_eq!(v["note"], Value::Null);
    }

    let (_, v) = t.get(&format!("{path}?tz=Asia/Manila")).await;
    let rows = v["rows"].as_array().unwrap();
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0]["kind"], "withdrawal", "newest first");
    assert_eq!(rows[1]["day"], "2026-08-02");
    assert_eq!(rows[2]["day"], "2026-08-01");
    assert_eq!(
        v["summary"],
        json!({
            "deposits": { "count": 2, "total": 600.5 },
            "withdrawals": { "count": 1, "total": 150.0 },
            "adjustments": { "count": 0, "total": 0.0 },
            "transfersIn": { "count": 0, "total": 0.0 },
            "transfersOut": { "count": 0, "total": 0.0 },
            "net": 450.5,
        })
    );
    let days: Vec<_> = v["daily"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| {
            (
                d["day"].as_str().unwrap(),
                d["cumulative"].as_f64().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        days,
        [
            ("2026-08-01", 500.0),
            ("2026-08-02", 600.5),
            ("2026-09-10", 450.5)
        ]
    );

    // Delete one; a second delete and a bad id are 404.
    let flow = format!("{path}/{}", first["id"].as_str().unwrap());
    let (s, _) = t.send(Method::DELETE, &flow, Some(COOKIE), None).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (s, v) = t.send(Method::DELETE, &flow, Some(COOKIE), None).await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    assert_eq!(v["error"], "This deposit or withdrawal does not exist.");
    let (s, _) = t
        .send(Method::DELETE, &format!("{path}/nope"), Some(COOKIE), None)
        .await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    let (_, v) = t.get(&path).await;
    assert_eq!(v["summary"]["deposits"]["count"], 1);

    // Deleting the account deletes its cash flows.
    t.send(
        Method::DELETE,
        &format!("/api/accounts/{id}"),
        Some(COOKIE),
        None,
    )
    .await;
    let n: i64 = sqlx::query_scalar("select count(*) from cash_flows")
        .fetch_one(&t.pool)
        .await
        .unwrap();
    assert_eq!(n, 0);
}

#[tokio::test]
async fn cash_flow_bulk_actions() {
    let t = setup().await;
    let id = t.new_account().await;
    let path = format!("/api/accounts/{id}/cash-flows");
    let mut ids = vec![];
    for kind in ["deposit", "withdrawal", "adjustment", "deposit"] {
        let (_, f) = t
            .post(
                &path,
                json!({ "occurredAt": "2026-08-01T09:00:00Z", "kind": kind, "amount": 10 }),
            )
            .await;
        ids.push(f["id"].as_str().unwrap().to_string());
    }
    // Another user's entry.
    let bob = Some(BOB_COOKIE);
    let (_, other) = t
        .send(
            Method::POST,
            "/api/accounts",
            bob,
            Some(json!({ "name": "Bob" })),
        )
        .await;
    let other = other["id"].as_str().unwrap().to_string();
    let (_, foreign) = t
        .send(
            Method::POST,
            &format!("/api/accounts/{other}/cash-flows"),
            bob,
            Some(json!({ "occurredAt": "2026-08-01T09:00:00Z", "kind": "deposit", "amount": 5 })),
        )
        .await;
    let foreign = foreign["id"].as_str().unwrap().to_string();
    let bulk = format!("{path}/bulk");

    // Marking skips the adjustment and the other account's entry.
    let (s, v) = t
        .post(
            &bulk,
            json!({ "ids": [&ids[0], &ids[1], &ids[2], &foreign], "action": "markInternal" }),
        )
        .await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(v, json!({ "affected": 2 }));
    let (_, f) = t.get(&path).await;
    assert_eq!(
        f["summary"]["transfersIn"],
        json!({ "count": 1, "total": 10.0 })
    );
    assert_eq!(
        f["summary"]["transfersOut"],
        json!({ "count": 1, "total": 10.0 })
    );
    let (_, v) = t
        .post(&bulk, json!({ "ids": [&ids[0]], "action": "markExternal" }))
        .await;
    assert_eq!(v, json!({ "affected": 1 }));

    let (_, v) = t
        .post(
            &bulk,
            json!({ "ids": [&ids[0], &ids[2], &foreign], "action": "delete" }),
        )
        .await;
    assert_eq!(v, json!({ "affected": 2 }));
    let (_, f) = t.get(&path).await;
    assert_eq!(f["rows"].as_array().unwrap().len(), 2);
    let (_, f) = t
        .send(
            Method::GET,
            &format!("/api/accounts/{other}/cash-flows"),
            bob,
            None,
        )
        .await;
    assert_eq!(
        f["rows"].as_array().unwrap().len(),
        1,
        "other user's entry untouched"
    );

    for (body, error) in [
        (
            json!({ "ids": [], "action": "delete" }),
            "Choose at least one entry.",
        ),
        (
            json!({ "ids": [&ids[1]], "action": "archive" }),
            "Use delete, markInternal or markExternal for \"action\".",
        ),
    ] {
        let (s, v) = t.post(&bulk, body.clone()).await;
        assert_eq!(s, StatusCode::BAD_REQUEST, "{body}");
        assert_eq!(v["error"], error);
    }
}

#[tokio::test]
async fn cash_flow_validation() {
    let t = setup().await;
    let id = t.new_account().await;
    let path = format!("/api/accounts/{id}/cash-flows");
    let at = "2026-08-01T09:00:00Z";
    for (body, error) in [
        (
            json!({ "occurredAt": at, "kind": "bonus", "amount": 10 }),
            "Use deposit, withdrawal or adjustment for \"kind\".",
        ),
        (
            json!({ "occurredAt": at, "kind": "deposit", "amount": 0 }),
            "The amount must be more than zero.",
        ),
        (
            json!({ "occurredAt": at, "kind": "withdrawal", "amount": -5 }),
            "The amount must be more than zero.",
        ),
        (
            json!({ "occurredAt": at, "kind": "deposit", "amount": 1, "note": "x".repeat(201) }),
            "Keep the note under 200 characters.",
        ),
    ] {
        let (s, v) = t.post(&path, body.clone()).await;
        assert_eq!(s, StatusCode::BAD_REQUEST, "{body}");
        assert_eq!(v["error"], error);
    }
    for body in [
        json!({ "occurredAt": "yesterday", "kind": "deposit", "amount": 1 }),
        json!({ "kind": "deposit", "amount": 1 }),
        json!({ "occurredAt": at, "kind": "deposit", "amount": "ten" }),
    ] {
        let (s, v) = t.post(&path, body.clone()).await;
        assert_eq!(s, StatusCode::BAD_REQUEST, "{body}");
        assert!(v["error"]
            .as_str()
            .unwrap()
            .starts_with("The request body is not valid"));
    }
    let (s, v) = t.get(&format!("{path}?tz=Mars/Base")).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert!(v["error"].as_str().unwrap().contains("Mars/Base"));
}

impl TestApp {
    async fn patch(&self, path: &str, body: Value) -> (StatusCode, Value) {
        self.send(Method::PATCH, path, Some(COOKIE), Some(body))
            .await
    }
}

/// One buy closed in two parts (ticket 1, stop moved to breakeven) and one sell (ticket 2), on Oct 18 UTC.
const JOURNAL_CSV: &str = "ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,profit,close_reason\n\
1,2026-10-18T09:00:00,2026-10-18T09:20:00,buy,0.1,XAUUSD,100,104,100,110,0,0,40,user\n\
1,2026-10-18T09:00:00,2026-10-18T09:40:00,buy,0.1,XAUUSD,100,106,100,110,0,0,60,user\n\
2,2026-10-18T23:30:00,2026-10-18T23:45:00,sell,0.2,EURUSD,1.2,1.21,1.205,1.19,0,0,-20,sl\n";

#[tokio::test]
async fn journal_tags() {
    let t = setup().await;
    let (s, v) = t.get("/api/journal/tags").await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["setups"], json!([]));
    let mistakes = v["mistakes"].as_array().unwrap();
    assert_eq!(mistakes.len(), 12);
    assert_eq!(
        (mistakes[0]["name"].as_str(), mistakes[0]["group"].as_str()),
        (Some("FOMO"), Some("entry"))
    );
    assert_eq!(mistakes[11]["name"], "Bored");
    // Presets are made once.
    let (_, v) = t.get("/api/journal/tags").await;
    assert_eq!(v["mistakes"].as_array().unwrap().len(), 12);

    let (s, setup) = t
        .post(
            "/api/journal/setups",
            json!({ "name": "  Pullback   to EMA " }),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{setup}");
    assert_eq!(
        (setup["name"].as_str(), setup["archived"].as_bool()),
        (Some("Pullback to EMA"), Some(false))
    );
    let (s, v) = t
        .post("/api/journal/setups", json!({ "name": "pullback TO ema" }))
        .await;
    assert_eq!(
        (s, v["error"].as_str()),
        (
            StatusCode::BAD_REQUEST,
            Some("You already have “Pullback to EMA”.")
        )
    );
    let (s, _) = t
        .post("/api/journal/setups", json!({ "name": "x".repeat(41) }))
        .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, _) = t
        .post("/api/journal/setups", json!({ "name": "A", "extra": 1 }))
        .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);

    // Archive frees the name; restoring it next to a new one with the same name fails.
    let sid = setup["id"].as_str().unwrap();
    let (s, v) = t
        .patch(
            &format!("/api/journal/setups/{sid}"),
            json!({ "archived": true }),
        )
        .await;
    assert_eq!((s, v["archived"].as_bool()), (StatusCode::OK, Some(true)));
    let (s, _) = t
        .post("/api/journal/setups", json!({ "name": "Pullback to EMA" }))
        .await;
    assert_eq!(s, StatusCode::OK);
    let (s, _) = t
        .patch(
            &format!("/api/journal/setups/{sid}"),
            json!({ "archived": false }),
        )
        .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, v) = t
        .patch(
            &format!("/api/journal/setups/{sid}"),
            json!({ "name": "Old pullback", "archived": false }),
        )
        .await;
    assert_eq!(
        (s, v["name"].as_str()),
        (StatusCode::OK, Some("Old pullback"))
    );

    let (s, m) = t
        .post(
            "/api/journal/mistakes",
            json!({ "name": "Ignored news", "group": "mindset" }),
        )
        .await;
    assert_eq!((s, m["preset"].as_bool()), (StatusCode::OK, Some(false)));
    let (s, _) = t
        .post(
            "/api/journal/mistakes",
            json!({ "name": "X", "group": "luck" }),
        )
        .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);

    // Bob cannot see or change Alice's tags.
    let (s, _) = t
        .send(
            Method::PATCH,
            &format!("/api/journal/setups/{sid}"),
            Some(BOB_COOKIE),
            Some(json!({ "name": "Mine" })),
        )
        .await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    let (_, v) = t
        .send(Method::GET, "/api/journal/tags", Some(BOB_COOKIE), None)
        .await;
    assert_eq!(v["setups"], json!([]));
}

#[tokio::test]
async fn journal_reviews_and_summary() {
    let t = setup().await;
    let id = t.new_account().await;
    let body =
        json!({ "fileName": "j.csv", "csv": JOURNAL_CSV, "mapping": engine::exness_mapping() });
    let (s, v) = t.post(&format!("/api/accounts/{id}/imports"), body).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let (_, tags) = t.get("/api/journal/tags").await;
    let revenge = tags["mistakes"][3]["id"].as_str().unwrap().to_string();
    let (_, setup) = t
        .post("/api/journal/setups", json!({ "name": "Breakout" }))
        .await;
    let sid = setup["id"].as_str().unwrap().to_string();

    // Positions: partial closes merged, days in Manila, newest first.
    let (s, j) = t
        .get(&format!("/api/accounts/{id}/journal?tz=Asia/Manila"))
        .await;
    assert_eq!(s, StatusCode::OK, "{j}");
    let p = j["positions"].as_array().unwrap();
    assert_eq!(p.len(), 2);
    assert_eq!(
        (p[0]["ticket"].as_str(), p[0]["day"].as_str()),
        (Some("2"), Some("2026-10-19"))
    );
    assert_eq!(
        (
            p[1]["lots"].as_f64(),
            p[1]["net"].as_f64(),
            p[1]["closePrice"].as_f64()
        ),
        (Some(0.2), Some(100.0), Some(105.0))
    );
    assert_eq!(p[1]["close"], "2026-10-18T09:40:00Z");
    // Ticket 1's stop is at the entry (moved): ask, no R. Ticket 2's stop was not moved: R from it.
    assert_eq!(
        (p[1]["askStop"].as_bool(), p[1]["r"].is_null()),
        (Some(true), true)
    );
    assert_eq!(
        (p[0]["askStop"].as_bool(), p[0]["r"].as_f64()),
        (Some(false), Some(-2.0))
    );

    // A starting stop gives ticket 1 an R; fields left out are kept; null clears.
    let trade = |ticket: &str| format!("/api/accounts/{id}/journal/trades/{ticket}");
    let (s, r) = t
        .patch(&trade("1"), json!({ "followedPlan": true, "setupId": sid, "grade": "A", "initialStop": 99, "initialTarget": 110, "note": "  Clean  " }))
        .await;
    assert_eq!(s, StatusCode::OK, "{r}");
    assert_eq!(
        (
            r["note"].as_str(),
            r["mistakeIds"].clone(),
            r["initialTarget"].as_f64()
        ),
        (Some("Clean"), json!([]), Some(110.0))
    );
    let (_, r) = t
        .patch(&trade("1"), json!({ "mood": 5, "grade": null }))
        .await;
    assert_eq!(
        (
            r["followedPlan"].as_bool(),
            r["grade"].is_null(),
            r["mood"].as_i64()
        ),
        (Some(true), true, Some(5))
    );
    let (_, r) = t
        .patch(
            &trade("2"),
            json!({ "followedPlan": false, "mistakeIds": [revenge, revenge] }),
        )
        .await;
    assert_eq!(r["mistakeIds"], json!([revenge]));

    for (body, msg) in [
        (json!({ "grade": "D" }), "The grade must be A, B or C."),
        (
            json!({ "mood": 6 }),
            "The mood must be a number from 1 to 5.",
        ),
        (
            json!({ "initialStop": -1 }),
            "The starting stop must be a price above 0.",
        ),
        (
            json!({ "note": "x".repeat(501) }),
            "A note can be up to 500 characters.",
        ),
        (
            json!({ "noMistakes": true }),
            "Pick mistakes or None, not both.",
        ),
        (
            json!({ "setupId": Uuid::new_v4().to_string() }),
            "This setup does not exist.",
        ),
        (json!({ "colour": "red" }), "Unknown field: colour."),
    ] {
        let (s, v) = t.patch(&trade("2"), body).await;
        assert_eq!(
            (s, v["error"].as_str()),
            (StatusCode::BAD_REQUEST, Some(msg))
        );
    }
    let (s, _) = t.patch(&trade("nope"), json!({ "mood": 1 })).await;
    assert_eq!(s, StatusCode::NOT_FOUND);

    // Days.
    let day = |d: &str| format!("/api/accounts/{id}/journal/days/{d}");
    let (s, d) = t
        .patch(
            &day("2026-10-18"),
            json!({ "preMood": 4, "risks": ["news", "tired", "news"], "watchSetupIds": [sid] }),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{d}");
    assert_eq!(
        (d["day"].as_str(), d["risks"].clone()),
        (Some("2026-10-18"), json!(["tired", "news"]))
    );
    let (s, v) = t
        .patch(&day("2026-10-18"), json!({ "noRisks": true }))
        .await;
    assert_eq!(
        (s, v["error"].as_str()),
        (
            StatusCode::BAD_REQUEST,
            Some("Pick risks or None, not both.")
        )
    );
    let (s, _) = t.patch(&day("18-10-2026"), json!({ "preMood": 1 })).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    // A day without trades still gets a stats row.
    t.patch(&day("2026-10-21"), json!({ "note": "Rest day" }))
        .await;
    let (_, j) = t.get(&format!("/api/accounts/{id}/journal")).await;
    assert_eq!(
        j["stats"][0],
        json!({ "day": "2026-10-21", "trades": 0, "net": 0.0 })
    );
    assert_eq!(
        j["stats"][1],
        json!({ "day": "2026-10-18", "trades": 2, "net": 80.0 })
    );
    assert_eq!(
        (
            j["trades"].as_array().unwrap().len(),
            j["days"].as_array().unwrap().len()
        ),
        (2, 2)
    );

    // Summary: paid plans only.
    let (_, v) = t.get(&format!("/api/accounts/{id}/journal/summary")).await;
    assert_eq!(v, json!({ "locked": true }));
    t.set_plan("u_alice", "espresso").await;
    let (s, v) = t.get(&format!("/api/accounts/{id}/journal/summary")).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(
        v["byPlan"][0],
        json!({ "key": "yes", "trades": 1, "net": 100.0, "winRate": 1.0, "avgR": 5.0 })
    );
    assert_eq!(v["byMistake"][0]["key"], json!(revenge));
    assert_eq!(
        (
            v["byMood"][3]["trades"].as_u64(),
            v["byMood"][3]["net"].as_f64()
        ),
        (Some(1), Some(80.0))
    );

    // Every answer cleared: the review is deleted.
    let (s, _) = t.patch(&day("2026-10-21"), json!({ "note": "  " })).await;
    assert_eq!(s, StatusCode::NO_CONTENT);
    let (s, _) = t
        .patch(
            &trade("2"),
            json!({ "followedPlan": null, "mistakeIds": [] }),
        )
        .await;
    assert_eq!(s, StatusCode::NO_CONTENT);

    // Bob cannot read or write Alice's journal.
    let (s, _) = t
        .send(
            Method::GET,
            &format!("/api/accounts/{id}/journal"),
            Some(BOB_COOKIE),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::NOT_FOUND);
    let (s, _) = t
        .send(
            Method::PATCH,
            &trade("1"),
            Some(BOB_COOKIE),
            Some(json!({ "mood": 1 })),
        )
        .await;
    assert_eq!(s, StatusCode::NOT_FOUND);
}

/// A stand-in for TradingView's chart websocket. 1-minute series come back empty (like old windows
/// without an account), symbols with NOPE are unknown, and everything else gets two 5-minute bars at
/// 00:20 and 00:25 on Sep 28. Counts its connections.
async fn fake_tradingview() -> (String, std::sync::Arc<std::sync::atomic::AtomicUsize>) {
    use futures_util::{SinkExt, StreamExt};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio_tungstenite::tungstenite::Message;
    let calls = std::sync::Arc::new(AtomicUsize::new(0));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("ws://{}", listener.local_addr().unwrap());
    let c = calls.clone();
    tokio::spawn(async move {
        while let Ok((tcp, _)) = listener.accept().await {
            c.fetch_add(1, Ordering::SeqCst);
            tokio::spawn(async move {
                let mut ws = tokio_tungstenite::accept_async(tcp).await.unwrap();
                let mut symbol = String::new();
                while let Some(Ok(Message::Text(text))) = ws.next().await {
                    for payload in api::tradingview::unframe(&text) {
                        let v: Value = serde_json::from_str(payload).unwrap_or_default();
                        let reply = match v["m"].as_str() {
                            Some("resolve_symbol") => {
                                symbol = v["p"][2].as_str().unwrap_or("").to_string();
                                continue;
                            }
                            Some("create_series") if symbol.contains("NOPE") => {
                                json!({ "m": "symbol_error", "p": ["cs", "ser_1", "invalid symbol"] })
                            }
                            Some("create_series") if v["p"][4] == "1" => {
                                json!({ "m": "series_completed", "p": ["cs", "$prices", "streaming", "s1", { "data_completed": "limit" }] })
                            }
                            Some("create_series") => {
                                let bar = |i: i64, t: i64| json!({ "i": i, "v": [t, 1.0, 2.0, 0.5, 1.5, 9.0] });
                                let update = json!({ "m": "timescale_update", "p": ["cs", { "$prices": { "s": [bar(0, 1790554800), bar(1, 1790555100)] } }] });
                                ws.send(Message::text(api::tradingview::frame(
                                    &update.to_string(),
                                )))
                                .await
                                .unwrap();
                                json!({ "m": "series_completed", "p": ["cs", "$prices", "streaming", "s1", {}] })
                            }
                            _ => continue,
                        };
                        ws.send(Message::text(api::tradingview::frame(&reply.to_string())))
                            .await
                            .unwrap();
                    }
                }
            });
        }
    });
    (url, calls)
}

#[tokio::test]
async fn candles_are_fetched_once_and_kept() {
    use std::sync::atomic::Ordering;
    let t = setup().await;
    let id = t.new_account().await;
    let (url, calls) = fake_tradingview().await;
    // Only this test talks to TradingView.
    std::env::set_var("TRADINGVIEW_WS", url);

    let path = |symbol: &str, tf: &str, from: &str, to: &str| {
        format!("/api/accounts/{id}/candles?symbol={symbol}&tf={tf}&from={from}&to={to}")
    };
    let (from, to) = ("2026-09-28T00:20:00Z", "2026-09-28T00:30:00Z");
    // 1m is empty, so it steps up to 5m: two calls.
    let (s, v) = t.get(&path("XAUUSD", "1m", from, to)).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["tf"], "5m");
    assert_eq!(
        v["candles"][0],
        json!({ "time": 1790554800, "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5 })
    );
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    // The same window, and a window inside it, come from the database, for both lengths.
    let (_, again) = t.get(&path("XAUUSD", "1m", from, to)).await;
    assert_eq!(again, v);
    let (_, inside) = t
        .get(&path(
            "XAUUSD",
            "5m",
            "2026-09-28T00:22:00Z",
            "2026-09-28T00:28:00Z",
        ))
        .await;
    assert_eq!(inside["candles"].as_array().unwrap().len(), 2);
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    // A later window is new: one more call.
    t.get(&path(
        "XAUUSD",
        "5m",
        "2026-09-28T00:20:00Z",
        "2026-09-28T00:40:00Z",
    ))
    .await;
    assert_eq!(calls.load(Ordering::SeqCst), 3);

    // Unknown symbol: every candidate (OANDA, FX, FOREXCOM) is tried, then 404.
    let (s, v) = t.get(&path("NOPE", "5m", from, to)).await;
    assert_eq!(
        (s, v["error"].as_str()),
        (StatusCode::NOT_FOUND, Some("No prices for this symbol."))
    );
    let (s, _) = t.get(&path("XAUUSD", "2m", from, to)).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, _) = t.get(&path("XAUUSD", "1m", to, from)).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    let (s, _) = t
        .get(&path("XAUUSD", "1m", from, "2026-10-28T00:00:00Z"))
        .await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
    let (s, _) = t
        .send(
            Method::GET,
            &path("XAUUSD", "1m", from, to),
            Some(BOB_COOKIE),
            None,
        )
        .await;
    assert_eq!(s, StatusCode::NOT_FOUND);
}

// --- MT5 report import ------------------------------------------------------------

const MT5: &str = include_str!("../../engine/tests/fixtures/mt5-report.html");

fn mt5_body(dry_run: bool) -> Value {
    json!({ "fileName": "ReportHistory.html", "format": "mt5", "report": MT5, "serverTz": "UTC", "dryRun": dry_run })
}

#[tokio::test]
async fn mt5_import_into_an_empty_account() {
    let t = setup().await;
    let id = t.new_account().await;
    let path = format!("/api/accounts/{id}/imports");

    // The dry run counts without writing.
    let (s, v) = t.post(&path, mt5_body(true)).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["dryRun"], true);
    assert_eq!(v["import"], Value::Null);
    assert_eq!(
        v["account"],
        json!({ "login": "50001234", "server": "Example-MT5Live2", "kind": "real",
                "currency": "USD", "company": "Example Markets Ltd" })
    );
    assert_eq!(v["positions"], 10);
    assert_eq!(v["totalNet"], 1206.16);
    assert_eq!(v["from"], "2026-03-01T08:00:00Z");
    assert_eq!(v["to"], "2026-03-09T11:00:00Z");
    assert_eq!(v["trades"], json!({ "added": 10, "duplicates": 0 }));
    assert_eq!(v["cashFlows"]["added"], 4);
    assert_eq!(
        v["cashFlows"]["summary"],
        json!({
            "deposits": { "count": 2, "total": 1500.0 },
            "withdrawals": { "count": 1, "total": 200.0 },
            "adjustments": { "count": 1, "total": 3.4 },
            "transfersIn": { "count": 0, "total": 0.0 },
            "transfersOut": { "count": 1, "total": 200.0 },
            "net": 1300.0,
        })
    );
    assert_eq!(v["skippedDeals"], json!({ "credit": 1 }));
    let (_, accounts) = t.get("/api/accounts").await;
    assert_eq!(accounts[0]["trades"], 0);
    assert_eq!(
        accounts[0]["mtLogin"],
        Value::Null,
        "a dry run writes nothing"
    );

    let (s, v) = t.post(&path, mt5_body(false)).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["dryRun"], false);
    assert_eq!(v["import"]["fileName"], "ReportHistory.html");
    assert_eq!(v["import"]["added"], 10);
    assert_eq!(v["import"]["skipped"], 1, "the credit deal");
    assert_eq!(v["trades"], json!({ "added": 10, "duplicates": 0 }));
    assert_eq!(v["cashFlows"]["added"], 4);
    assert_eq!(v["cashFlows"]["possibleManualDuplicates"], json!([]));

    // The account took the login and the broker.
    let (_, accounts) = t.get("/api/accounts").await;
    assert_eq!(accounts[0]["mtLogin"], "50001234");
    assert_eq!(accounts[0]["broker"], "Example Markets Ltd");
    assert_eq!(accounts[0]["trades"], 10);

    let (_, a) = t.get(&format!("/api/accounts/{id}/analytics")).await;
    assert_eq!(a["summary"]["trades"], 10);
    assert!((a["summary"]["net"].as_f64().unwrap() - 1206.16).abs() < 0.001);
    let reasons: Vec<(String, u64)> = a["byReason"]
        .as_array()
        .unwrap()
        .iter()
        .map(|g| {
            (
                g["key"].as_str().unwrap().to_string(),
                g["trades"].as_u64().unwrap(),
            )
        })
        .collect();
    for (key, n) in [
        ("Stop loss", 3),
        ("Take profit", 2),
        ("Stop-out", 1),
        ("Manual", 4),
    ] {
        assert!(
            reasons.contains(&(key.to_string(), n)),
            "{key} in {reasons:?}"
        );
    }
    let comment: Option<String> =
        sqlx::query_scalar("select comment from trades where ticket = '1003'")
            .fetch_one(&t.pool)
            .await
            .unwrap();
    assert_eq!(comment.as_deref(), Some("range breakout"));

    // Cash flows, with the adjustment kept apart from deposits.
    let (_, f) = t.get(&format!("/api/accounts/{id}/cash-flows")).await;
    assert_eq!(f["rows"].as_array().unwrap().len(), 4);
    assert_eq!(
        f["summary"]["adjustments"],
        json!({ "count": 1, "total": 3.4 })
    );
    assert_eq!(f["summary"]["net"], 1300.0);
    let adj = f["rows"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["kind"] == "adjustment")
        .unwrap();
    assert_eq!(adj["note"], "Negative balance reset (broker): D-NULL");
    assert_eq!(adj["sourceId"], "5016");
    // The withdrawal with an INT part is an internal transfer; the deposits are not.
    let internal: Vec<(&str, bool)> = f["rows"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| {
            (
                r["sourceId"].as_str().unwrap(),
                r["internal"].as_bool().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        internal,
        [
            ("5018", true),
            ("5017", false),
            ("5016", false),
            ("5001", false)
        ]
    );

    // Importing it again adds nothing.
    let (s, v) = t.post(&path, mt5_body(false)).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["trades"], json!({ "added": 0, "duplicates": 10 }));
    assert_eq!(
        (&v["cashFlows"]["added"], &v["cashFlows"]["duplicates"]),
        (&json!(0), &json!(4))
    );
    assert_eq!(
        (&v["import"]["added"], &v["import"]["duplicates"]),
        (&json!(0), &json!(10))
    );
    let (_, f) = t.get(&format!("/api/accounts/{id}/cash-flows")).await;
    assert_eq!(f["rows"].as_array().unwrap().len(), 4);
}

#[tokio::test]
async fn mt5_import_refuses_another_login() {
    let t = setup().await;
    let id = t.new_account().await;
    sqlx::query("update trading_accounts set mt_login = '777'")
        .execute(&t.pool)
        .await
        .unwrap();
    let path = format!("/api/accounts/{id}/imports");
    for dry_run in [true, false] {
        let (s, v) = t.post(&path, mt5_body(dry_run)).await;
        assert_eq!(s, StatusCode::CONFLICT, "{v}");
        assert!(v["error"].as_str().unwrap().starts_with(
            "This report is for MetaTrader account 50001234. This Jurno account holds 777."
        ));
    }
    let (_, accounts) = t.get("/api/accounts").await;
    assert_eq!(accounts[0]["trades"], 0);
}

#[tokio::test]
async fn mt5_import_after_a_csv_skips_stored_tickets() {
    let t = setup().await;
    let id = t.new_account().await;
    let path = format!("/api/accounts/{id}/imports");
    // Position 1004 closed in two parts, imported from a CSV as two rows.
    let csv = "ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,profit,close_reason\n\
1004,2026-03-03T09:00:00,2026-03-03T09:20:00,buy,0.01,XAUUSD,2910,2915,2905,2920,0,0,5,user\n\
1004,2026-03-03T09:00:00,2026-03-03T10:00:00,buy,0.02,XAUUSD,2910,2920,2905,2920,0,0,20,tp\n";
    let (s, v) = t
        .post(
            &path,
            json!({ "fileName": "p.csv", "csv": csv, "mapping": engine::exness_mapping() }),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");

    let (s, v) = t.post(&path, mt5_body(false)).await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["trades"], json!({ "added": 9, "duplicates": 1 }));
    let (_, accounts) = t.get("/api/accounts").await;
    assert_eq!(accounts[0]["trades"], 11, "the two CSV rows stay");
    assert_eq!(accounts[0]["mtLogin"], "50001234");
    assert_eq!(accounts[0]["currency"], "USD");
}

#[tokio::test]
async fn mt5_import_points_out_manual_duplicates() {
    let t = setup().await;
    let id = t.new_account().await;
    let flows = format!("/api/accounts/{id}/cash-flows");
    // The same 500 deposit, entered by hand the same day; and an unrelated one.
    let (_, manual) = t
        .post(
            &flows,
            json!({ "occurredAt": "2026-03-01T15:00:00Z", "kind": "deposit", "amount": 500 }),
        )
        .await;
    t.post(
        &flows,
        json!({ "occurredAt": "2026-03-01T15:00:00Z", "kind": "deposit", "amount": 499 }),
    )
    .await;
    let (s, v) = t
        .post(&format!("/api/accounts/{id}/imports"), mt5_body(false))
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    let dups = v["cashFlows"]["possibleManualDuplicates"]
        .as_array()
        .unwrap();
    assert_eq!(dups.len(), 1);
    assert_eq!(dups[0]["id"], manual["id"]);
    assert_eq!(dups[0]["amount"], 500.0);
    // Nothing is deleted.
    let (_, f) = t.get(&flows).await;
    assert_eq!(f["rows"].as_array().unwrap().len(), 6);
    // A hand-entered adjustment is allowed too.
    let (s, v) = t
        .post(
            &flows,
            json!({ "occurredAt": "2026-03-02T15:00:00Z", "kind": "adjustment", "amount": 1.5 }),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["sourceId"], Value::Null);
}

#[tokio::test]
async fn mt5_import_errors() {
    let t = setup().await;
    let id = t.new_account().await;
    let path = format!("/api/accounts/{id}/imports");
    let (s, v) = t
        .post(
            &path,
            json!({ "fileName": "a.html", "format": "mt5", "report": "a,b\n1,2" }),
        )
        .await;
    assert_eq!(s, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(v["error"]
        .as_str()
        .unwrap()
        .starts_with("This file is not a MetaTrader 5"));
    let (s, v) = t
        .post(
            &path,
            json!({ "fileName": "a.html", "format": "mt5", "report": MT5, "serverTz": "Mars/Base" }),
        )
        .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert!(v["error"].as_str().unwrap().contains("Mars/Base"));
    let (s, v) = t
        .post(
            &path,
            json!({ "fileName": "a.html", "format": "mt4", "report": MT5 }),
        )
        .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert_eq!(
        v["error"],
        "Use \"mt5\" for \"format\", or leave it out for a CSV file."
    );
    let (s, v) = t
        .post(&path, json!({ "fileName": "a.html", "format": "mt5" }))
        .await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
    assert!(v["error"]
        .as_str()
        .unwrap()
        .starts_with("The request body is not valid"));
    // serverTz defaults to UTC.
    let (s, v) = t
        .post(
            &path,
            json!({ "fileName": "a.html", "format": "mt5", "report": MT5, "dryRun": true }),
        )
        .await;
    assert_eq!(s, StatusCode::OK, "{v}");
    assert_eq!(v["from"], "2026-03-01T08:00:00Z");
}
