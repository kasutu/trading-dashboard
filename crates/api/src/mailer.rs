//! Sends email through Resend (https://resend.com). Without `RESEND_API_KEY` the email is
//! written to the log instead, for local development.

use serde_json::json;

use crate::config::features;

pub struct Email<'a> {
    pub to: &'a str,
    pub subject: &'a str,
    pub text: String,
    pub html: String,
    /// One-click unsubscribe URL, sent as `List-Unsubscribe`.
    pub unsubscribe: Option<String>,
}

pub async fn send(email: Email<'_>) -> Result<(), String> {
    let f = features();
    let Some(key) = &f.resend_api_key else {
        tracing::info!(
            "email (RESEND_API_KEY not set, not sent) to {}: {}\n{}",
            email.to,
            email.subject,
            email.text
        );
        return Ok(());
    };
    let mut body = json!({
        "from": f.email_from,
        "to": [email.to],
        "subject": email.subject,
        "text": email.text,
        "html": email.html,
    });
    if let Some(url) = &email.unsubscribe {
        body["headers"] = json!({
            "List-Unsubscribe": format!("<{url}>"),
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        });
    }
    let resp = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("email client: {e}"))?
        .post("https://api.resend.com/emails")
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("cannot reach the email provider: {e}"))?;
    if resp.status().is_success() {
        Ok(())
    } else {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        Err(format!(
            "the email provider refused the email ({status}): {text}"
        ))
    }
}

/// Escapes text for HTML.
pub fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
