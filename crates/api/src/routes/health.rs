//! Public routes: health check and broker presets.

use axum::Json;
use serde_json::{json, Value};

pub async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

pub async fn presets() -> Json<Value> {
    Json(json!({ "exness": engine::exness_mapping() }))
}
