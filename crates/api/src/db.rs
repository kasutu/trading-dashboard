//! Postgres pool and migrations.

use sqlx::postgres::{PgPool, PgPoolOptions};

/// Connects to Postgres and applies the app migrations.
pub async fn connect(url: &str) -> Result<PgPool, sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(url)
        .await?;
    sqlx::migrate!().run(&pool).await?;
    Ok(pool)
}
