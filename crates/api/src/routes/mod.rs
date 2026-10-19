//! The router. One module per resource.

mod accounts;
mod analytics;
mod health;
mod imports;
mod mappings;
mod me;

use axum::extract::DefaultBodyLimit;
use axum::routing::{delete, get, patch};
use axum::Router;
use sqlx::PgPool;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::trace::TraceLayer;

/// Largest request body: CSV uploads up to 20 MB.
const MAX_BODY: usize = 20 * 1024 * 1024;

pub fn app(pool: PgPool) -> Router {
    let api = Router::new()
        .route("/health", get(health::health))
        .route("/presets", get(health::presets))
        .route("/me", get(me::me))
        .route("/accounts", get(accounts::list).post(accounts::create))
        .route(
            "/accounts/{id}",
            patch(accounts::update).delete(accounts::remove),
        )
        .route(
            "/accounts/{id}/imports",
            get(imports::list).post(imports::create),
        )
        .route("/accounts/{id}/analytics", get(analytics::analytics))
        .route("/accounts/{id}/trades", get(analytics::trades))
        .route("/mappings", get(mappings::list).post(mappings::create))
        .route("/mappings/{id}", delete(mappings::remove));

    Router::new()
        .nest("/api", api)
        .layer(DefaultBodyLimit::disable())
        .layer(RequestBodyLimitLayer::new(MAX_BODY))
        .layer(TraceLayer::new_for_http())
        .with_state(pool)
}
