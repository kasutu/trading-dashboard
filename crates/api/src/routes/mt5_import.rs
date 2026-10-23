//! MT5 report import: `POST /api/accounts/:id/imports` with `format: "mt5"`.
//!
//! - The trading account takes the report's MetaTrader login on its first MT5 import; a report
//!   for another login is refused (409).
//! - Trades: one per position. A position whose ticket is already stored (for example as CSV
//!   partial-close rows) is skipped and counted as a duplicate.
//! - Cash flows: one per `balance` deal, keyed by the deal ticket (`source_id`), so a re-import
//!   skips them. Hand-entered flows that look like an imported one (same kind and amount within
//!   a day) are returned as possible duplicates; nothing is deleted.
//! - `dryRun: true` does all of the above without writing, for the preview.

use std::collections::{BTreeMap, HashSet};

use chrono::{DateTime, Duration, Utc};
use engine::{FlowKind, Mt5Error};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::analytics::parse_tz;
use super::imports::Import;
use crate::error::{ApiError, ApiResult};
use crate::trade_row::insert_trades;

const MAX_NOTE: usize = 200;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mt5Import {
    file_name: String,
    /// The report's text (the web app decodes the UTF-16 file before sending it).
    report: String,
    /// IANA timezone of the broker server's clock. Exness servers run on UTC.
    #[serde(default = "utc")]
    server_tz: String,
    #[serde(default)]
    dry_run: bool,
}

fn utc() -> String {
    "UTC".into()
}

/// A hand-entered cash flow that may be the same money as an imported one.
#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
struct ManualFlow {
    id: Uuid,
    occurred_at: DateTime<Utc>,
    kind: String,
    amount: f64,
    note: Option<String>,
}

pub async fn import(pool: &PgPool, id: Uuid, body: Mt5Import) -> ApiResult<Value> {
    let Mt5Import {
        file_name,
        report,
        server_tz,
        dry_run,
    } = body;
    parse_tz(&server_tz)?;
    let report = tokio::task::spawn_blocking(move || engine::parse_mt5_report(&report, &server_tz))
        .await
        .map_err(|e| ApiError::Internal(format!("parser crashed: {e}")))?
        .map_err(|e| ApiError::Unprocessable(error_message(&e)))?;
    if report.trades.is_empty() && report.cash_flows.is_empty() {
        return Err(ApiError::Unprocessable(
            "The report has no closed positions and no deposits or withdrawals.".into(),
        ));
    }
    let login = report.account.login.clone();

    let mut tx = pool.begin().await?;
    let (held, broker, stored_rows): (Option<String>, Option<String>, i64) = sqlx::query_as(
        "select mt_login, broker,
            (select count(*) from trades where account_id = $1)
            + (select count(*) from cash_flows where account_id = $1)
         from trading_accounts where id = $1 for update",
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;
    if let Some(held) = held.as_ref().filter(|h| **h != login) {
        return Err(ApiError::Conflict(format!(
            "This report is for MetaTrader account {login}. This Jurno account holds {held}. \
             Import it into the Jurno account for {login}, or create a new one."
        )));
    }

    // Trades: skip every position whose ticket is stored in any form.
    let tickets: Vec<&str> = report.trades.iter().map(|t| t.ticket.as_str()).collect();
    let stored: HashSet<String> = sqlx::query_scalar(
        "select distinct ticket from trades where account_id = $1 and ticket = any($2)",
    )
    .bind(id)
    .bind(&tickets)
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .collect();
    let new_trades: Vec<engine::Trade> = report
        .trades
        .iter()
        .filter(|t| !stored.contains(&t.ticket))
        .cloned()
        .collect();
    let trade_dups = report.trades.len() - new_trades.len();

    // Cash flows: skip the deals already imported.
    let deals: Vec<&str> = report.cash_flows.iter().map(|f| f.deal.as_str()).collect();
    let stored: HashSet<String> = sqlx::query_scalar(
        "select source_id from cash_flows where account_id = $1 and source_id = any($2)",
    )
    .bind(id)
    .bind(&deals)
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .collect();
    let new_flows: Vec<&engine::Mt5CashFlow> = report
        .cash_flows
        .iter()
        .filter(|f| !stored.contains(&f.deal))
        .collect();
    let flow_dups = report.cash_flows.len() - new_flows.len();

    let manual: Vec<ManualFlow> = sqlx::query_as(
        "select id, occurred_at, kind, amount, note from cash_flows
         where account_id = $1 and source_id is null order by occurred_at",
    )
    .bind(id)
    .fetch_all(&mut *tx)
    .await?;
    let possible_dups: Vec<&ManualFlow> = manual
        .iter()
        .filter(|m| {
            new_flows.iter().any(|f| {
                kind_text(f.kind) == m.kind
                    && (f.amount - m.amount).abs() < 0.005
                    && (f.time - m.occurred_at).abs() <= Duration::days(1)
            })
        })
        .collect();

    let skipped_deals: u32 = report.skipped.values().sum();
    let import: Option<Import> = if dry_run {
        None
    } else {
        if held.is_none() {
            // First MT5 import: the account takes the login, and the broker and currency
            // when it has nothing yet.
            sqlx::query(
                "update trading_accounts set mt_login = $2,
                    broker = coalesce(broker, $3),
                    currency = case when $5 then coalesce($4, currency) else currency end
                 where id = $1",
            )
            .bind(id)
            .bind(&login)
            .bind(report.account.company.as_ref().filter(|_| broker.is_none()))
            .bind(&report.account.currency)
            .bind(stored_rows == 0)
            .execute(&mut *tx)
            .await?;
        }
        insert_trades(&mut tx, id, &new_trades, &report.comments).await?;
        sqlx::query(
            "insert into cash_flows (account_id, occurred_at, kind, amount, note, source_id)
             select $1, * from unnest($2::timestamptz[], $3::text[], $4::float8[], $5::text[],
                $6::text[])
             on conflict (account_id, source_id) where source_id is not null do nothing",
        )
        .bind(id)
        .bind(new_flows.iter().map(|f| f.time).collect::<Vec<_>>())
        .bind(
            new_flows
                .iter()
                .map(|f| kind_text(f.kind))
                .collect::<Vec<_>>(),
        )
        .bind(new_flows.iter().map(|f| f.amount).collect::<Vec<_>>())
        .bind(new_flows.iter().map(|f| note(&f.note)).collect::<Vec<_>>())
        .bind(new_flows.iter().map(|f| f.deal.clone()).collect::<Vec<_>>())
        .execute(&mut *tx)
        .await?;
        let import = sqlx::query_as(
            "insert into imports (account_id, file_name, added, duplicates, skipped)
             values ($1, $2, $3, $4, $5)
             returning id, file_name, added, duplicates, skipped, created_at",
        )
        .bind(id)
        .bind(file_name)
        .bind(new_trades.len() as i32)
        .bind(trade_dups as i32)
        .bind((report.skipped_rows + skipped_deals) as i32)
        .fetch_one(&mut *tx)
        .await?;
        Some(import)
    };
    if dry_run {
        tx.rollback().await?;
    } else {
        tx.commit().await?;
    }

    let flows: Vec<engine::CashFlow> = report
        .cash_flows
        .iter()
        .map(|f| engine::CashFlow {
            time: f.time,
            kind: f.kind,
            amount: f.amount,
        })
        .collect();
    let times = report
        .trades
        .iter()
        .flat_map(|t| [t.open, t.close])
        .chain(report.cash_flows.iter().map(|f| f.time));
    let (from, to) = times.fold((None, None), |(lo, hi): (Option<_>, Option<_>), t| {
        (
            Some(lo.map_or(t, |l: DateTime<Utc>| l.min(t))),
            Some(hi.map_or(t, |h: DateTime<Utc>| h.max(t))),
        )
    });
    let a = &report.account;
    Ok(json!({
        "dryRun": dry_run,
        "import": import,
        "account": {
            "login": a.login, "server": a.server, "kind": a.kind,
            "currency": a.currency, "company": a.company,
        },
        "from": from,
        "to": to,
        "positions": report.trades.len(),
        "totalNet": report.total_net,
        "trades": { "added": new_trades.len(), "duplicates": trade_dups },
        "cashFlows": {
            "added": new_flows.len(),
            "duplicates": flow_dups,
            "summary": engine::cash_report(&flows, "UTC").summary,
            "possibleManualDuplicates": possible_dups,
        },
        "skippedDeals": report.skipped.iter().collect::<BTreeMap<_, _>>(),
        "skippedRows": report.skipped_rows,
    }))
}

fn kind_text(kind: FlowKind) -> &'static str {
    match kind {
        FlowKind::Deposit => "deposit",
        FlowKind::Withdrawal => "withdrawal",
        FlowKind::Adjustment => "adjustment",
    }
}

/// The note to store: at most 200 characters, empty as null.
fn note(text: &str) -> Option<String> {
    let t = text.trim();
    (!t.is_empty()).then(|| t.chars().take(MAX_NOTE).collect())
}

fn error_message(e: &Mt5Error) -> String {
    match e {
        Mt5Error::NotAReport => {
            "This file is not a MetaTrader 5 trade history report. In MetaTrader 5, \
            open the History tab, right-click, choose Report and save it as HTML."
                .into()
        }
        Mt5Error::NoAccount => {
            "The report has no Account line, so the MetaTrader account is unknown.".into()
        }
        Mt5Error::BadTimezone(tz) => format!("\"{tz}\" is not a known timezone."),
    }
}
