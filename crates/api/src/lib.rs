//! Jurno HTTP API. See docs/architecture.md for the contract.

pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod extract;
pub mod plan;
pub mod routes;
pub mod trade_row;

pub use routes::app;
