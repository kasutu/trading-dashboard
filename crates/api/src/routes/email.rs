//! The reminder email settings, address verification and unsubscribe.
//!
//! - `GET /api/email`, `PATCH /api/email`: the settings. A new address gets a verification
//!   link; nothing is sent to it until the link is opened.
//! - `POST /api/email/verify`: sends the verification link again.
//! - `POST /api/email/test`: sends today's reminder now.
//! - `GET /api/email/verify?token=` and `GET|POST /api/email/unsubscribe?token=` (public):
//!   the links in the emails. They answer with a small HTML page.

use axum::extract::State;
use axum::response::Html;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool};

use super::analytics::parse_tz;
use crate::auth::UserId;
use crate::config::features;
use crate::error::{ApiError, ApiResult};
use crate::extract::{Json, Query};
use crate::mailer::{self, esc, Email};

#[derive(FromRow)]
struct Row {
    email: Option<String>,
    verified_at: Option<DateTime<Utc>>,
    verify_sent_at: Option<DateTime<Utc>>,
    enabled: bool,
    frequency: String,
    send_time: String,
    tz: String,
    unsubscribe_token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailSettings {
    email: Option<String>,
    verified: bool,
    enabled: bool,
    frequency: String,
    time: String,
    tz: String,
    /// The server has an email provider. Without one, emails only go to the server log.
    can_send: bool,
}

impl From<Row> for EmailSettings {
    fn from(r: Row) -> Self {
        Self {
            verified: r.email.is_some() && r.verified_at.is_some(),
            email: r.email,
            enabled: r.enabled,
            frequency: r.frequency,
            time: r.send_time,
            tz: r.tz,
            can_send: features().resend_api_key.is_some(),
        }
    }
}

const COLUMNS: &str =
    "email, verified_at, verify_sent_at, enabled, frequency, send_time, tz, unsubscribe_token";

async fn row(pool: &PgPool, user: &str) -> ApiResult<Row> {
    Ok(sqlx::query_as(&format!(
        "insert into email_reminders (user_id) values ($1)
         on conflict (user_id) do update set user_id = excluded.user_id
         returning {COLUMNS}"
    ))
    .bind(user)
    .fetch_one(pool)
    .await?)
}

pub async fn get(
    State(pool): State<PgPool>,
    UserId(user): UserId,
) -> ApiResult<Json<EmailSettings>> {
    Ok(Json(row(&pool, &user).await?.into()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Patch {
    email: Option<String>,
    enabled: Option<bool>,
    frequency: Option<String>,
    time: Option<String>,
    tz: Option<String>,
}

fn clean_email(e: &str) -> ApiResult<String> {
    let e = e.trim().to_lowercase();
    let ok = e.len() <= 254
        && e.split_once('@').is_some_and(|(a, d)| {
            !a.is_empty() && d.contains('.') && !d.starts_with('.') && !d.ends_with('.')
        })
        && !e.contains(char::is_whitespace)
        && !e.ends_with(".invalid");
    if ok {
        Ok(e)
    } else {
        Err(ApiError::bad_request(
            "Enter an email address such as you@example.com.",
        ))
    }
}

fn valid_time(t: &str) -> bool {
    let b = t.as_bytes();
    b.len() == 5
        && b[2] == b':'
        && t[..2].parse::<u32>().is_ok_and(|h| h < 24)
        && t[3..].parse::<u32>().is_ok_and(|m| m < 60)
}

pub async fn update(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Json(p): Json<Patch>,
) -> ApiResult<Json<EmailSettings>> {
    let current = row(&pool, &user).await?;
    if let Some(f) = &p.frequency {
        if !["weekdays", "daily", "weekly"].contains(&f.as_str()) {
            return Err(ApiError::bad_request(
                "Use weekdays, daily or weekly for \"frequency\".",
            ));
        }
    }
    if p.time.as_deref().is_some_and(|t| !valid_time(t)) {
        return Err(ApiError::bad_request("Use a time such as 08:00."));
    }
    if let Some(tz) = &p.tz {
        parse_tz(tz)?;
    }
    let new_email = match p.email.as_deref().map(str::trim) {
        None => None,
        Some("") => Some(None),
        Some(e) => Some(Some(clean_email(e)?)),
    };
    let changed = new_email
        .as_ref()
        .is_some_and(|e| e.as_deref() != current.email.as_deref());
    let token = changed.then(|| uuid::Uuid::new_v4().simple().to_string());
    let r: Row = sqlx::query_as(&format!(
        "update email_reminders set
            enabled = coalesce($2, enabled),
            frequency = coalesce($3, frequency),
            send_time = coalesce($4, send_time),
            tz = coalesce($5, tz),
            email = case when $6 then $7 else email end,
            verified_at = case when $6 then null else verified_at end,
            verify_token = case when $6 then $8 else verify_token end,
            verify_sent_at = case when $6 and $7 is not null then now() else verify_sent_at end
         where user_id = $1 returning {COLUMNS}"
    ))
    .bind(&user)
    .bind(p.enabled)
    .bind(p.frequency)
    .bind(p.time)
    .bind(p.tz)
    .bind(changed)
    .bind(new_email.flatten())
    .bind(&token)
    .fetch_one(&pool)
    .await?;
    if let (Some(email), Some(token)) = (&r.email, &token) {
        send_verification(email, token).await?;
    }
    Ok(Json(r.into()))
}

async fn send_verification(email: &str, token: &str) -> ApiResult<()> {
    let url = format!("{}/api/email/verify?token={token}", features().public_url);
    mailer::send(Email {
        to: email,
        subject: "Verify your email for Jurno",
        text: format!(
            "Open this link to get your daily plan from Jurno at this address:\n{url}\n\n\
             If you did not ask for this, ignore this email."
        ),
        html: format!(
            "<p>Open this link to get your daily plan from Jurno at this address:</p>\
             <p><a href=\"{u}\">Verify my email</a></p>\
             <p style=\"color:#78716c\">If you did not ask for this, ignore this email.</p>",
            u = esc(&url)
        ),
        unsubscribe: None,
    })
    .await
    .map_err(|e| ApiError::Internal(format!("verification email: {e}")))
}

/// Sends the verification link again, at most once a minute.
pub async fn resend(
    State(pool): State<PgPool>,
    UserId(user): UserId,
) -> ApiResult<Json<EmailSettings>> {
    let r = row(&pool, &user).await?;
    let Some(email) = r.email.clone().filter(|_| r.verified_at.is_none()) else {
        return Err(ApiError::bad_request(
            "There is no address waiting to be verified.",
        ));
    };
    if r.verify_sent_at
        .is_some_and(|t| Utc::now() - t < Duration::minutes(1))
    {
        return Err(ApiError::Conflict(
            "A link was sent less than a minute ago. Check your inbox.".into(),
        ));
    }
    let token = uuid::Uuid::new_v4().simple().to_string();
    sqlx::query(
        "update email_reminders set verify_token = $2, verify_sent_at = now() where user_id = $1",
    )
    .bind(&user)
    .bind(&token)
    .execute(&pool)
    .await?;
    send_verification(&email, &token).await?;
    Ok(Json(r.into()))
}

/// Sends today's reminder now, to the verified address.
pub async fn test(State(pool): State<PgPool>, UserId(user): UserId) -> ApiResult<Json<Value>> {
    let r = row(&pool, &user).await?;
    let Some(email) = r.email.as_deref().filter(|_| r.verified_at.is_some()) else {
        return Err(ApiError::bad_request("Verify your email address first."));
    };
    let mail = crate::reminders::build(
        &pool,
        &user,
        &r.tz,
        r.frequency == "weekly",
        &r.unsubscribe_token,
    )
    .await?
    .ok_or_else(|| {
        ApiError::Unprocessable(
            "Import some trades first. The email shows your plan from them.".into(),
        )
    })?;
    mailer::send(mail.to_email(email))
        .await
        .map_err(|e| ApiError::Internal(format!("test email: {e}")))?;
    Ok(Json(serde_json::json!({ "sent": true })))
}

#[derive(Deserialize)]
pub struct TokenQuery {
    token: Option<String>,
}

fn page(title: &str, text: &str) -> Html<String> {
    Html(format!(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">\
         <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{t}</title></head>\
         <body style=\"font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:64px auto;padding:0 16px;color:#1c1917\">\
         <h1 style=\"font-size:24px\">{t}</h1><p>{x}</p><p><a href=\"{u}\">Open Jurno</a></p></body></html>",
        t = esc(title),
        x = esc(text),
        u = esc(&features().public_url),
    ))
}

/// Public: the link in the verification email.
pub async fn verify(
    State(pool): State<PgPool>,
    Query(q): Query<TokenQuery>,
) -> ApiResult<Html<String>> {
    let token = q.token.unwrap_or_default();
    let done = sqlx::query(
        "update email_reminders set verified_at = now(), verify_token = null
         where verify_token = $1 and email is not null and verify_sent_at > now() - interval '7 days'",
    )
    .bind(&token)
    .execute(&pool)
    .await?
    .rows_affected();
    Ok(if done > 0 && !token.is_empty() {
        page(
            "Email verified",
            "Jurno can now send your daily plan to this address. Turn it on in Settings.",
        )
    } else {
        page(
            "This link does not work",
            "It was used already or is older than 7 days. Send a new one from Settings.",
        )
    })
}

/// Public: one-click unsubscribe (the link in every reminder, and `List-Unsubscribe-Post`).
pub async fn unsubscribe(
    State(pool): State<PgPool>,
    Query(q): Query<TokenQuery>,
) -> ApiResult<Html<String>> {
    let token = q.token.unwrap_or_default();
    let done =
        sqlx::query("update email_reminders set enabled = false where unsubscribe_token = $1")
            .bind(&token)
            .execute(&pool)
            .await?
            .rows_affected();
    Ok(if done > 0 && !token.is_empty() {
        page(
            "You are unsubscribed",
            "Jurno will not email your daily plan anymore. You can turn it on again in Settings.",
        )
    } else {
        page(
            "This link does not work",
            "Turn the emails off in Settings instead.",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn emails_and_times() {
        assert_eq!(clean_email(" Me@Example.com ").unwrap(), "me@example.com");
        assert!(clean_email("alice@users.jurno.invalid").is_err());
        assert!(clean_email("nope").is_err());
        assert!(clean_email("a@b").is_err());
        assert!(valid_time("08:00") && valid_time("23:59"));
        assert!(!valid_time("24:00") && !valid_time("8:00") && !valid_time("08:60"));
    }
}
