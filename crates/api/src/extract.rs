//! `Json` and `Query` that reject with our JSON error shape instead of plain text.

use axum::extract::{FromRequest, FromRequestParts};

use crate::error::ApiError;

#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(ApiError))]
pub struct Json<T>(pub T);

#[derive(FromRequestParts)]
#[from_request(via(axum::extract::Query), rejection(ApiError))]
pub struct Query<T>(pub T);

impl<T: serde::Serialize> axum::response::IntoResponse for Json<T> {
    fn into_response(self) -> axum::response::Response {
        axum::Json(self.0).into_response()
    }
}
