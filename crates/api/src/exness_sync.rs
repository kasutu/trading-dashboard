//! Exness account sync: fetches the deal and order history with the Exness Trader API and
//! stores the closed positions as trades and the balance deals as cash flows.
//!
//! - Every sync fetches from a little before the last synced time (or from as far back as the
//!   API allows on the first sync) to now, in windows the API accepts.
//! - Raw deals and orders are kept in `exness_history`, and positions are rebuilt from all of
//!   them (`engine::deals`), so a position opened in one sync and closed in a later one works.
//! - Trades whose ticket is already stored (from a CSV or MT5 report) and cash flows whose deal
//!   is already stored are skipped, the same as the MT5 import.
//! - After 3 failed syncs in a row the connection is paused until the user connects again.

use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration as StdDuration;

use chrono::{DateTime, Duration, SecondsFormat, Utc};
use engine::deals::{BrokerDeal, BrokerOrder};
use engine::FlowKind;
use exness::model::{DealHistoryItem, HistoryQuery, OrderHistoryItem, Side as ExSide};
use exness::{Client, Signer};
use sqlx::types::Json as Jsonb;
use sqlx::PgPool;
use uuid::Uuid;

use crate::crypto;
use crate::error::ApiError;
use crate::trade_row::insert_trades;

/// How often connected accounts sync on their own.
pub const EVERY: StdDuration = StdDuration::from_secs(10 * 60);
/// Each sync starts this long before the last synced time, in case a deal came in late.
const OVERLAP: i64 = 60 * 60;
/// Failed syncs in a row before the connection is paused.
pub const MAX_FAILURES: i32 = 3;
const PAGE: u32 = 200;

/// Host discovery runs on these. Account calls need the account's own host.
pub const DISCOVERY_HOSTS: [&str; 2] = ["api.exness.com", "api.exness-api.com"];

/// Runs forever. Start it once, next to the HTTP server.
pub async fn run(pool: PgPool) {
    let mut tick = tokio::time::interval(EVERY);
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tick.tick().await;
        let due: Vec<Uuid> = match sqlx::query_scalar(
            "select account_id from exness_connections
             where status <> 'paused' and (last_sync_at is null or last_sync_at < now() - interval '9 minutes')",
        )
        .fetch_all(&pool)
        .await
        {
            Ok(d) => d,
            Err(e) => {
                tracing::error!("exness sync: {e}");
                continue;
            }
        };
        for account in due {
            if let Err(e) = sync(&pool, account).await {
                tracing::warn!("exness sync for {account}: {e:?}");
            }
        }
    }
}

/// Accounts syncing right now, so a "Sync now" and the timer never run at once.
fn running() -> &'static Mutex<HashSet<Uuid>> {
    static R: std::sync::OnceLock<Mutex<HashSet<Uuid>>> = std::sync::OnceLock::new();
    R.get_or_init(Default::default)
}

struct Running(Uuid);
impl Drop for Running {
    fn drop(&mut self) {
        running().lock().unwrap().remove(&self.0);
    }
}

/// A plain-language message for an SDK error.
pub fn explain(e: &exness::Error) -> String {
    use exness::Error as E;
    match e {
        E::Key(m) => format!("The private key is not valid: {m}."),
        E::Api { status: 401 | 403, error } => format!(
            "Exness refused the API key ({}). Check the key, that it has history access, and that this server's IP is allowed.",
            error.error_message
        ),
        E::Api { status: 404, .. } | E::Http { status: 404, .. } => {
            "Exness does not know this account. Check the account number.".into()
        }
        E::Api { status: 429, .. } => "Exness asked Jurno to slow down. It tries again later.".into(),
        E::Api { status, error } => format!("Exness answered {status}: {}.", error.error_message),
        E::Http { status: 401 | 403, .. } => {
            "Exness refused the request. Check the API key and that this server's IP is allowed.".into()
        }
        E::Http { status, .. } => format!("Exness answered {status}. Try again later."),
        E::Transport(_) | E::Timeout(_) => "Cannot reach Exness. Jurno tries again later.".into(),
        E::Decode(_) => "Exness sent an answer Jurno cannot read.".into(),
        E::Config(m) | E::IdempotencyKey(m) => m.clone(),
    }
}

/// Builds the client for an account's own host. `host` None: finds it with host discovery.
pub async fn connect_client(
    signer: Signer,
    exness_account: &str,
    host: Option<&str>,
) -> Result<Client, exness::Error> {
    if let Some(h) = host.map(str::trim).filter(|h| !h.is_empty()) {
        return Ok(Client::new(h, signer));
    }
    let mut last = None;
    for h in DISCOVERY_HOSTS {
        let c = Client::new(h, signer.clone());
        match c.discover_access_point(exness_account).await {
            Ok(ap) => return Ok(c.with_access_point(&ap)),
            Err(e) => last = Some(e),
        }
    }
    Err(last.expect("at least one discovery host"))
}

fn rfc3339(t: DateTime<Utc>) -> String {
    t.to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn time(s: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|t| t.with_timezone(&Utc))
}

fn num(s: &Option<String>) -> Option<f64> {
    s.as_deref().and_then(|v| v.trim().parse().ok())
}

fn side(s: Option<ExSide>) -> Option<engine::Side> {
    match s {
        Some(ExSide::Buy) => Some(engine::Side::Buy),
        Some(ExSide::Sell) => Some(engine::Side::Sell),
        _ => None,
    }
}

pub fn broker_deal(item: &DealHistoryItem) -> Option<BrokerDeal> {
    let d = &item.deal;
    Some(BrokerDeal {
        id: d.deal_id.clone(),
        kind: d.deal_type.as_str().to_string(),
        time: time(&d.create_time).or_else(|| time(&item.event_time))?,
        order_id: d.order_id.clone(),
        position_id: d.position_id.clone(),
        side: side(d.direction),
        symbol: d.instrument.clone(),
        volume: num(&d.volume),
        price: num(&d.price),
        profit: d.profit.as_ref().and_then(|p| p.amount.trim().parse().ok()),
        commission: num(&d.commission),
    })
}

pub fn broker_order(item: &OrderHistoryItem) -> Option<BrokerOrder> {
    let o = &item.order;
    Some(BrokerOrder {
        id: o.order_id.clone(),
        time: time(&item.event_time).or_else(|| time(&o.create_time))?,
        position_id: o.position_id.clone(),
        reason: o.reason.map(|r| r.as_str().to_string()),
        stop_loss: num(&o.stop_loss_price),
        take_profit: num(&o.take_profit_price),
    })
}

/// How far back and how wide one history request can be, in days.
async fn history_limits(c: &Client, account: &str) -> (i64, i64) {
    let (mut age, mut range) = (90, 30);
    if let Ok(l) = c.limits(account).await {
        if let Some(m) = l
            .limits
            .rest
            .methods
            .iter()
            .find(|m| m.path.contains("/history/") && m.path.contains("deals"))
            .and_then(|m| m.limits.as_ref())
        {
            age = m.history_age_days.unwrap_or(90) as i64;
            range = m.history_range_days.unwrap_or(30) as i64;
        }
    }
    (age.max(1), range.max(1))
}

/// Result of one sync.
pub struct Synced {
    pub trades: usize,
    pub flows: usize,
}

#[derive(sqlx::FromRow)]
struct Conn {
    exness_account_id: String,
    host: String,
    api_key: Vec<u8>,
    private_key: Vec<u8>,
    synced_until: Option<DateTime<Utc>>,
}

/// Syncs one account and records the outcome on its connection. An error is also stored as
/// `last_error`.
pub async fn sync(pool: &PgPool, account: Uuid) -> Result<Synced, ApiError> {
    if !running().lock().unwrap().insert(account) {
        return Err(ApiError::Conflict(
            "This account is syncing now. Wait a moment.".into(),
        ));
    }
    let _guard = Running(account);
    let started = Utc::now();
    let result = fetch_and_store(pool, account, started).await;
    match &result {
        Ok(s) => {
            sqlx::query(
                "update exness_connections set status = 'ok', failures = 0, last_error = null,
                    last_sync_at = $2, last_sync_trades = $3, last_sync_flows = $4, synced_until = $2
                 where account_id = $1",
            )
            .bind(account)
            .bind(started)
            .bind(s.trades as i32)
            .bind(s.flows as i32)
            .execute(pool)
            .await?;
        }
        Err(e) => {
            let msg = match e {
                ApiError::Internal(_) => {
                    "Something went wrong on our side. Jurno tries again later.".to_string()
                }
                ApiError::BadRequest(m)
                | ApiError::Unprocessable(m)
                | ApiError::Conflict(m)
                | ApiError::Forbidden(m) => m.clone(),
                ApiError::NotFound(m) => m.to_string(),
                ApiError::Unauthorized => "Not allowed.".into(),
            };
            sqlx::query(
                "update exness_connections set failures = failures + 1, last_error = $2, last_sync_at = $3,
                    status = case when failures + 1 >= $4 then 'paused' else 'failing' end
                 where account_id = $1",
            )
            .bind(account)
            .bind(msg)
            .bind(started)
            .bind(MAX_FAILURES)
            .execute(pool)
            .await?;
        }
    }
    result
}

async fn fetch_and_store(
    pool: &PgPool,
    account: Uuid,
    now: DateTime<Utc>,
) -> Result<Synced, ApiError> {
    let c: Conn = sqlx::query_as(
        "select exness_account_id, host, api_key, private_key, synced_until
         from exness_connections where account_id = $1",
    )
    .bind(account)
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::NotFound(
        "This account is not connected to Exness.",
    ))?;
    let api_key = crypto::open(account, &c.api_key)?;
    let private_key = crypto::open(account, &c.private_key)?;
    let signer = Signer::from_key_text(api_key, &private_key)
        .map_err(|e| ApiError::Unprocessable(explain(&e)))?;
    drop(private_key);
    let client = Client::new(&c.host, signer);
    let ex = c.exness_account_id.as_str();
    let fail = |e: exness::Error| ApiError::Unprocessable(explain(&e));

    let (age, range) = history_limits(&client, ex).await;
    let oldest = now - Duration::days(age) + Duration::minutes(5);
    let mut from = c
        .synced_until
        .map(|t| t - Duration::seconds(OVERLAP))
        .unwrap_or(oldest)
        .max(oldest);

    let mut deals: Vec<DealHistoryItem> = Vec::new();
    let mut orders: Vec<OrderHistoryItem> = Vec::new();
    while from < now {
        let to = (from + Duration::days(range)).min(now);
        let mut q = HistoryQuery {
            from: Some(rfc3339(from)),
            to: Some(rfc3339(to)),
            limit: Some(PAGE),
            ..Default::default()
        };
        loop {
            let page = client.deals_history(ex, &q).await.map_err(fail)?;
            deals.extend(page.items);
            match page.next_cursor.filter(|_| page.has_more) {
                Some(cur) => q = q.next_page(cur),
                None => break,
            }
        }
        let mut q = HistoryQuery {
            from: Some(rfc3339(from)),
            to: Some(rfc3339(to)),
            limit: Some(PAGE),
            ..Default::default()
        };
        loop {
            let page = client.orders_history(ex, &q).await.map_err(fail)?;
            orders.extend(page.items);
            match page.next_cursor.filter(|_| page.has_more) {
                Some(cur) => q = q.next_page(cur),
                None => break,
            }
        }
        from = to;
    }
    store_history(pool, account, &deals, &orders).await?;
    import_history(pool, account).await
}

/// Keeps the raw history. A deal or order seen again replaces the stored one.
pub async fn store_history(
    pool: &PgPool,
    account: Uuid,
    deals: &[DealHistoryItem],
    orders: &[OrderHistoryItem],
) -> Result<(), sqlx::Error> {
    let mut rows: Vec<(&str, String, DateTime<Utc>, serde_json::Value)> = Vec::new();
    for d in deals {
        if let Some(b) = broker_deal(d) {
            rows.push((
                "deal",
                b.id,
                b.time,
                serde_json::to_value(d).unwrap_or_default(),
            ));
        }
    }
    for o in orders {
        if let Some(b) = broker_order(o) {
            rows.push((
                "order",
                b.id,
                b.time,
                serde_json::to_value(o).unwrap_or_default(),
            ));
        }
    }
    if rows.is_empty() {
        return Ok(());
    }
    sqlx::query(
        "insert into exness_history (account_id, kind, id, event_time, data)
         select $1, * from unnest($2::text[], $3::text[], $4::timestamptz[], $5::jsonb[])
         on conflict (account_id, kind, id) do update set event_time = excluded.event_time, data = excluded.data",
    )
    .bind(account)
    .bind(rows.iter().map(|r| r.0).collect::<Vec<_>>())
    .bind(rows.iter().map(|r| r.1.clone()).collect::<Vec<_>>())
    .bind(rows.iter().map(|r| r.2).collect::<Vec<_>>())
    .bind(rows.into_iter().map(|r| Jsonb(r.3)).collect::<Vec<_>>())
    .execute(pool)
    .await?;
    Ok(())
}

fn kind_text(kind: FlowKind) -> &'static str {
    match kind {
        FlowKind::Deposit => "deposit",
        FlowKind::Withdrawal => "withdrawal",
        FlowKind::Adjustment => "adjustment",
    }
}

/// Rebuilds positions from the stored history and adds the new trades and cash flows.
pub async fn import_history(pool: &PgPool, account: Uuid) -> Result<Synced, ApiError> {
    let stored: Vec<(String, Jsonb<serde_json::Value>)> =
        sqlx::query_as("select kind, data from exness_history where account_id = $1")
            .bind(account)
            .fetch_all(pool)
            .await?;
    let (mut deals, mut orders) = (Vec::new(), Vec::new());
    for (kind, data) in stored {
        if kind == "deal" {
            if let Some(d) = serde_json::from_value::<DealHistoryItem>(data.0)
                .ok()
                .as_ref()
                .and_then(broker_deal)
            {
                deals.push(d);
            }
        } else if let Some(o) = serde_json::from_value::<OrderHistoryItem>(data.0)
            .ok()
            .as_ref()
            .and_then(broker_order)
        {
            orders.push(o);
        }
    }
    let report = tokio::task::spawn_blocking(move || engine::deals::build(&deals, &orders))
        .await
        .map_err(|e| ApiError::Internal(format!("deals: {e}")))?;

    let mut tx = pool.begin().await?;
    let tickets: Vec<&str> = report.trades.iter().map(|t| t.ticket.as_str()).collect();
    let have: HashSet<String> = sqlx::query_scalar(
        "select distinct ticket from trades where account_id = $1 and ticket = any($2)",
    )
    .bind(account)
    .bind(&tickets)
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .collect();
    let new_trades: Vec<engine::Trade> = report
        .trades
        .iter()
        .filter(|t| !have.contains(&t.ticket))
        .cloned()
        .collect();
    insert_trades(&mut tx, account, &new_trades, &Default::default()).await?;
    let flows = &report.cash_flows;
    let added_flows = sqlx::query(
        "insert into cash_flows (account_id, occurred_at, kind, amount, note, source_id, internal)
         select $1, * from unnest($2::timestamptz[], $3::text[], $4::float8[], $5::text[], $6::text[], $7::bool[])
         on conflict (account_id, source_id) where source_id is not null do nothing",
    )
    .bind(account)
    .bind(flows.iter().map(|f| f.time).collect::<Vec<_>>())
    .bind(flows.iter().map(|f| kind_text(f.kind)).collect::<Vec<_>>())
    .bind(flows.iter().map(|f| f.amount).collect::<Vec<_>>())
    .bind(flows.iter().map(|f| (!f.note.is_empty()).then(|| f.note.clone())).collect::<Vec<_>>())
    .bind(flows.iter().map(|f| f.deal.clone()).collect::<Vec<_>>())
    .bind(flows.iter().map(|f| f.internal).collect::<Vec<_>>())
    .execute(&mut *tx)
    .await?
    .rows_affected() as usize;
    if !new_trades.is_empty() || added_flows > 0 {
        let skipped: u32 = report.skipped.values().sum::<u32>() + report.missing_open;
        sqlx::query(
            "insert into imports (account_id, file_name, added, duplicates, skipped) values ($1, 'Exness sync', $2, $3, $4)",
        )
        .bind(account)
        .bind(new_trades.len() as i32)
        .bind((report.trades.len() - new_trades.len()) as i32)
        .bind(skipped as i32)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(Synced {
        trades: new_trades.len(),
        flows: added_flows,
    })
}
