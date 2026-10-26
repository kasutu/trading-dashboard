//! Settings read from the environment.

use std::sync::OnceLock;

pub struct Config {
    pub database_url: String,
    pub port: u16,
}

impl Config {
    /// Reads `DATABASE_URL` (required) and `PORT` (default 8080).
    pub fn from_env() -> Result<Self, String> {
        let database_url =
            std::env::var("DATABASE_URL").map_err(|_| "Set DATABASE_URL to the Postgres URL.")?;
        let port = match std::env::var("PORT") {
            Ok(p) => p
                .parse()
                .map_err(|_| format!("PORT must be a number, got \"{p}\"."))?,
            Err(_) => 8080,
        };
        Ok(Self { database_url, port })
    }
}

/// Optional settings for email and the Exness sync. Read once, on first use.
pub struct Features {
    /// The public web origin, for links in emails. `PUBLIC_URL`, else `BETTER_AUTH_URL`.
    pub public_url: String,
    /// `RESEND_API_KEY`. Without it, emails are written to the log instead of sent.
    pub resend_api_key: Option<String>,
    /// `EMAIL_FROM`, for example `Jurno <reminders@jurno.app>`.
    pub email_from: String,
    /// `CREDENTIALS_KEY`: 32 bytes, base64. Encrypts broker credentials. Without it, accounts
    /// cannot be connected.
    pub credentials_key: Option<[u8; 32]>,
    /// The Exness connection. On unless `EXNESS_SYNC` is `off`.
    pub exness_sync: bool,
}

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.trim().is_empty())
}

pub fn features() -> &'static Features {
    static F: OnceLock<Features> = OnceLock::new();
    F.get_or_init(|| {
        let credentials_key = env("CREDENTIALS_KEY").and_then(|k| {
            use base64::Engine;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(k.trim())
                .ok()?;
            let key: Option<[u8; 32]> = bytes.try_into().ok();
            if key.is_none() {
                tracing::error!("CREDENTIALS_KEY must be 32 bytes in base64 (openssl rand -base64 32). Exness connections are off.");
            }
            key
        });
        Features {
            public_url: env("PUBLIC_URL")
                .or_else(|| env("BETTER_AUTH_URL"))
                .unwrap_or_else(|| "http://localhost:5173".into())
                .trim_end_matches('/')
                .to_string(),
            resend_api_key: env("RESEND_API_KEY"),
            email_from: env("EMAIL_FROM").unwrap_or_else(|| "Jurno <reminders@jurno.app>".into()),
            credentials_key,
            exness_sync: !env("EXNESS_SYNC").is_some_and(|v| v.eq_ignore_ascii_case("off")),
        }
    })
}
