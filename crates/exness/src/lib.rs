//! Client for the Exness Trader API.
//!
//! - [`Signer`] builds the `EXN-*` headers (Ed25519, sign version 1).
//! - [`Client`] sends signed REST requests. It has a typed method for each
//!   endpoint (see [`api`]) and generic `get`, `post`, `patch`, `delete`.
//! - [`model`] holds the request, response, and stream message types.
//!
//! The API contract is in `openapi/trading.public.yaml`.

pub mod api;
mod client;
mod error;
pub mod model;
pub mod signer;

pub use api::new_idempotency_key;
pub use client::{AccessPoint, Client};
pub use error::{ApiError, Error};
pub use signer::{SignedHeaders, Signer};
