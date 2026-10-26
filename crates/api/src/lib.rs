//! Jurno HTTP API. See docs/architecture.md for the contract.

pub mod admin;
pub mod auth;
pub mod config;
pub mod crypto;
pub mod db;
pub mod error;
pub mod exness_sync;
pub mod extract;
pub mod jobs;
pub mod mailer;
pub mod plan;
pub mod reminders;
pub mod routes;
pub mod today;
pub mod trade_row;
pub mod tradingview;

pub use routes::app;
