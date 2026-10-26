//! The router. One module per resource.

mod accounts;
mod analytics;
mod candles;
mod cash_flows;
mod email;
mod exness;
mod health;
mod imports;
mod journal;
mod mappings;
mod me;
mod mt5_import;
mod playbook;
mod today;

use axum::extract::DefaultBodyLimit;
use axum::routing::{delete, get, patch, post, put};
use axum::Router;
use sqlx::PgPool;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::trace::TraceLayer;

/// Largest request body: CSV uploads and MT5 reports up to 20 MB.
const MAX_BODY: usize = 20 * 1024 * 1024;

pub fn app(pool: PgPool) -> Router {
    let api = Router::new()
        .route("/health", get(health::health))
        .route("/presets", get(health::presets))
        .route("/me", get(me::me))
        .route("/me/settings", patch(me::update_settings))
        .route("/email", get(email::get).patch(email::update))
        .route("/email/verify", get(email::verify).post(email::resend))
        .route("/email/test", post(email::test))
        .route(
            "/email/unsubscribe",
            get(email::unsubscribe).post(email::unsubscribe),
        )
        .route("/accounts", get(accounts::list).post(accounts::create))
        .route(
            "/accounts/{id}",
            patch(accounts::update).delete(accounts::remove),
        )
        .route(
            "/accounts/{id}/imports",
            get(imports::list).post(imports::create),
        )
        .route(
            "/accounts/{id}/cash-flows",
            get(cash_flows::list).post(cash_flows::create),
        )
        .route("/accounts/{id}/cash-flows/bulk", post(cash_flows::bulk))
        .route(
            "/accounts/{id}/cash-flows/{flow}",
            delete(cash_flows::remove),
        )
        .route("/accounts/{id}/analytics", get(analytics::analytics))
        .route("/accounts/{id}/today", get(today::today))
        .route(
            "/accounts/{id}/playbook",
            get(playbook::list).post(playbook::create),
        )
        .route("/accounts/{id}/playbook/calc", post(playbook::calc))
        .route(
            "/accounts/{id}/playbook/symbols/{symbol}",
            put(playbook::set_symbol).delete(playbook::clear_symbol),
        )
        .route(
            "/accounts/{id}/playbook/{plan}",
            patch(playbook::update).delete(playbook::remove),
        )
        .route(
            "/accounts/{id}/exness",
            get(exness::get)
                .put(exness::connect)
                .delete(exness::disconnect),
        )
        .route("/accounts/{id}/exness/sync", post(exness::sync_now))
        .route("/accounts/{id}/trades", get(analytics::trades))
        .route("/accounts/{id}/candles", get(candles::candles))
        .route("/accounts/{id}/journal", get(journal::journal))
        .route("/accounts/{id}/journal/summary", get(journal::summary))
        .route(
            "/accounts/{id}/journal/trades/{ticket}",
            patch(journal::patch_trade),
        )
        .route(
            "/accounts/{id}/journal/days/{day}",
            patch(journal::patch_day),
        )
        .route("/journal/tags", get(journal::tags))
        .route("/journal/setups", post(journal::create_setup))
        .route("/journal/setups/{setup}", patch(journal::update_setup))
        .route("/journal/mistakes", post(journal::create_mistake))
        .route(
            "/journal/mistakes/{mistake}",
            patch(journal::update_mistake),
        )
        .route("/mappings", get(mappings::list).post(mappings::create))
        .route("/mappings/{id}", delete(mappings::remove));

    Router::new()
        .nest("/api", api)
        .layer(DefaultBodyLimit::disable())
        .layer(RequestBodyLimitLayer::new(MAX_BODY))
        .layer(TraceLayer::new_for_http())
        .with_state(pool)
}
