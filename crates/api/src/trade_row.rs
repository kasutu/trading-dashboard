//! Mapping between engine `Trade` and rows of the `trades` table.

use chrono::{DateTime, Utc};
use engine::{Side, Trade};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use uuid::Uuid;

#[derive(FromRow)]
struct TradeRow {
    ticket: String,
    opened_at: DateTime<Utc>,
    closed_at: DateTime<Utc>,
    side: String,
    lots: f64,
    symbol: String,
    open_price: f64,
    close_price: f64,
    stop_loss: Option<f64>,
    take_profit: Option<f64>,
    commission: f64,
    swap: f64,
    profit: f64,
    close_reason: String,
}

impl From<TradeRow> for Trade {
    fn from(r: TradeRow) -> Self {
        Trade {
            ticket: r.ticket,
            open: r.opened_at,
            close: r.closed_at,
            side: if r.side == "sell" {
                Side::Sell
            } else {
                Side::Buy
            },
            lots: r.lots,
            symbol: r.symbol,
            open_price: r.open_price,
            close_price: r.close_price,
            sl: r.stop_loss,
            tp: r.take_profit,
            commission: r.commission,
            swap: r.swap,
            profit: r.profit,
            // Same rule as the engine: profit + commission + swap, rounded to cents.
            net: ((r.profit + r.commission + r.swap) * 100.0).round() / 100.0,
            reason: r.close_reason,
        }
    }
}

fn side_text(side: Side) -> &'static str {
    match side {
        Side::Buy => "buy",
        Side::Sell => "sell",
    }
}

/// All trades of an account, sorted by open time.
// ponytail: loads every trade; page or pre-aggregate if accounts grow large
pub async fn load_trades(pool: &PgPool, account_id: Uuid) -> Result<Vec<Trade>, sqlx::Error> {
    let rows: Vec<TradeRow> = sqlx::query_as(
        "select ticket, opened_at, closed_at, side, lots, symbol, open_price, close_price,
                stop_loss, take_profit, commission, swap, profit, close_reason
         from trades where account_id = $1 order by opened_at, ticket",
    )
    .bind(account_id)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(Trade::from).collect())
}

/// Inserts trades, replacing rows with the same `(account_id, ticket)`.
/// Tickets must be unique within `trades`.
pub async fn upsert_trades(
    tx: &mut Transaction<'_, Postgres>,
    account_id: Uuid,
    trades: &[Trade],
) -> Result<(), sqlx::Error> {
    macro_rules! col {
        ($f:expr) => {
            trades.iter().map($f).collect::<Vec<_>>()
        };
    }
    sqlx::query(
        "insert into trades (account_id, ticket, opened_at, closed_at, side, lots, symbol,
            open_price, close_price, stop_loss, take_profit, commission, swap, profit, close_reason)
         select $1, * from unnest($2::text[], $3::timestamptz[], $4::timestamptz[], $5::text[],
            $6::float8[], $7::text[], $8::float8[], $9::float8[], $10::float8[], $11::float8[],
            $12::float8[], $13::float8[], $14::float8[], $15::text[])
         on conflict (account_id, ticket) do update set
            opened_at = excluded.opened_at, closed_at = excluded.closed_at, side = excluded.side,
            lots = excluded.lots, symbol = excluded.symbol, open_price = excluded.open_price,
            close_price = excluded.close_price, stop_loss = excluded.stop_loss,
            take_profit = excluded.take_profit, commission = excluded.commission,
            swap = excluded.swap, profit = excluded.profit, close_reason = excluded.close_reason",
    )
    .bind(account_id)
    .bind(col!(|t| t.ticket.clone()))
    .bind(col!(|t| t.open))
    .bind(col!(|t| t.close))
    .bind(col!(|t| side_text(t.side)))
    .bind(col!(|t| t.lots))
    .bind(col!(|t| t.symbol.clone()))
    .bind(col!(|t| t.open_price))
    .bind(col!(|t| t.close_price))
    .bind(col!(|t| t.sl))
    .bind(col!(|t| t.tp))
    .bind(col!(|t| t.commission))
    .bind(col!(|t| t.swap))
    .bind(col!(|t| t.profit))
    .bind(col!(|t| t.reason.clone()))
    .execute(&mut **tx)
    .await?;
    Ok(())
}
