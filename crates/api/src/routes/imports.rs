//! CSV imports: list past imports, import a file.

use std::collections::{HashMap, HashSet};

use axum::extract::{Path, State};
use chrono::{DateTime, Utc};
use engine::{ColumnMapping, Field, ParseError};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::accounts::owned_account;
use crate::auth::UserId;
use crate::error::{ApiError, ApiResult};
use crate::extract::Json;
use crate::trade_row::{trade_key, upsert_trades, TradeKey};

#[derive(Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Import {
    id: Uuid,
    file_name: String,
    added: i32,
    duplicates: i32,
    skipped: i32,
    created_at: DateTime<Utc>,
}

pub async fn list(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
) -> ApiResult<Json<Vec<Import>>> {
    let id = owned_account(&pool, &user, &id).await?;
    let rows = sqlx::query_as(
        "select id, file_name, added, duplicates, skipped, created_at
         from imports where account_id = $1 order by created_at desc",
    )
    .bind(id)
    .fetch_all(&pool)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewImport {
    file_name: String,
    csv: String,
    mapping: ColumnMapping,
}

/// Parses the CSV and upserts its trades on their key (ticket, close time, lots, close price).
/// Partial closes share a ticket and are kept as separate trades.
pub async fn create(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Json(body): Json<NewImport>,
) -> ApiResult<Json<Import>> {
    let id = owned_account(&pool, &user, &id).await?;
    let NewImport {
        file_name,
        csv,
        mapping,
    } = body;
    let parsed = tokio::task::spawn_blocking(move || engine::parse_csv(&csv, &mapping))
        .await
        .map_err(|e| ApiError::Internal(format!("parser crashed: {e}")))?
        .map_err(|e| ApiError::Unprocessable(parse_error_message(&e)))?;

    // Rows with the same key inside the file are true duplicates: keep the last one.
    let rows = parsed.trades.len();
    let mut by_key: HashMap<TradeKey, engine::Trade> = HashMap::with_capacity(rows);
    for t in parsed.trades {
        by_key.insert(trade_key(&t), t);
    }
    let trades: Vec<engine::Trade> = by_key.into_values().collect();
    let tickets: Vec<&str> = trades.iter().map(|t| t.ticket.as_str()).collect();

    let mut tx = pool.begin().await?;
    let stored: Vec<(String, DateTime<Utc>, f64, f64)> = sqlx::query_as(
        "select ticket, closed_at, lots, close_price from trades
         where account_id = $1 and ticket = any($2)",
    )
    .bind(id)
    .bind(&tickets)
    .fetch_all(&mut *tx)
    .await?;
    let stored: HashSet<TradeKey> = stored
        .into_iter()
        .map(|(ticket, close, lots, price)| (ticket, close, lots.to_bits(), price.to_bits()))
        .collect();
    let already = trades
        .iter()
        .filter(|t| stored.contains(&trade_key(t)))
        .count();
    upsert_trades(&mut tx, id, &trades).await?;

    let added = trades.len() - already;
    let duplicates = rows - added;
    let import: Import = sqlx::query_as(
        "insert into imports (account_id, file_name, added, duplicates, skipped)
         values ($1, $2, $3, $4, $5)
         returning id, file_name, added, duplicates, skipped, created_at",
    )
    .bind(id)
    .bind(file_name)
    .bind(added as i32)
    .bind(duplicates as i32)
    .bind(parsed.skipped_rows as i32)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(import))
}

/// A sentence the user can act on for each parse failure.
fn parse_error_message(e: &ParseError) -> String {
    match e {
        ParseError::MissingMapping(f) => {
            format!("Pick the column that holds the {}.", field_label(*f))
        }
        ParseError::MissingColumn(h) => format!("The column \"{h}\" is not in the file."),
        ParseError::BadTimezone(tz) => format!(
            "\"{tz}\" is not a known timezone. Use an IANA name such as \"UTC\" or \"Europe/London\"."
        ),
        ParseError::NoTrades => "The file has no trades that could be read.".into(),
        ParseError::Csv(m) => format!("The file is not a readable CSV: {m}"),
    }
}

fn field_label(f: Field) -> &'static str {
    match f {
        Field::Ticket => "ticket",
        Field::OpenTime => "open time",
        Field::CloseTime => "close time",
        Field::Side => "side",
        Field::Lots => "lots",
        Field::Symbol => "symbol",
        Field::OpenPrice => "open price",
        Field::ClosePrice => "close price",
        Field::StopLoss => "stop loss",
        Field::TakeProfit => "take profit",
        Field::Commission => "commission",
        Field::Swap => "swap",
        Field::Profit => "profit",
        Field::CloseReason => "close reason",
    }
}
