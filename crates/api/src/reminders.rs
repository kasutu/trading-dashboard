//! The daily reminder email: the Today card of each trading account, sent at the user's time.
//!
//! [`run`] checks every 15 minutes for users whose send time has passed today (in their
//! timezone) and who have not been sent one today. The day is claimed in the database before
//! sending, so two API instances never send the same email twice.

use std::time::Duration;

use chrono::{DateTime, Datelike, NaiveDate, Timelike, Utc};
use chrono_tz::Tz;
use engine::today::{and_list, money, plural, TodayPlan};
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::features;
use crate::mailer::{self, esc, Email};

const EVERY: Duration = Duration::from_secs(15 * 60);

/// Runs forever. Start it once, next to the HTTP server.
pub async fn run(pool: PgPool) {
    let mut tick = tokio::time::interval(EVERY);
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tick.tick().await;
        match send_due(&pool, Utc::now()).await {
            Ok(0) => {}
            Ok(n) => tracing::info!("sent {n} reminder emails"),
            Err(e) => tracing::error!("reminder emails: {e}"),
        }
    }
}

/// Whether the reminder goes out on this local day.
pub fn sends_on(frequency: &str, day: NaiveDate) -> bool {
    let wd = day.weekday().num_days_from_monday();
    match frequency {
        "daily" => true,
        "weekly" => wd == 0,
        _ => wd < 5,
    }
}

type Due = (
    String,
    String,
    String,
    String,
    String,
    String,
    Option<NaiveDate>,
);

/// Sends the emails that are due. Returns how many were sent.
pub async fn send_due(pool: &PgPool, now: DateTime<Utc>) -> Result<usize, sqlx::Error> {
    let rows: Vec<Due> = sqlx::query_as(
        "select user_id, email, frequency, send_time, tz, unsubscribe_token, last_sent_day
         from email_reminders
         where enabled and email is not null and verified_at is not null",
    )
    .fetch_all(pool)
    .await?;
    let mut sent = 0;
    for (user, email, frequency, send_time, tz_name, token, last) in rows {
        let tz: Tz = tz_name.parse().unwrap_or(Tz::UTC);
        let local = now.with_timezone(&tz);
        let day = local.date_naive();
        let time = format!("{:02}:{:02}", local.hour(), local.minute());
        if last == Some(day) || time < send_time || !sends_on(&frequency, day) {
            continue;
        }
        // Claim the day first: at most one email a day, even with two API instances.
        let claimed = sqlx::query(
            "update email_reminders set last_sent_day = $2
             where user_id = $1 and last_sent_day is distinct from $2",
        )
        .bind(&user)
        .bind(day)
        .execute(pool)
        .await?
        .rows_affected();
        if claimed == 0 {
            continue;
        }
        match build(pool, &user, &tz_name, frequency == "weekly", &token).await {
            Ok(Some(mail)) => match mailer::send(mail.to_email(&email)).await {
                Ok(()) => sent += 1,
                Err(e) => {
                    tracing::error!("reminder email for {user}: {e}");
                    // Not sent: try again at the next check.
                    sqlx::query("update email_reminders set last_sent_day = $2 where user_id = $1")
                        .bind(&user)
                        .bind(last)
                        .execute(pool)
                        .await?;
                }
            },
            Ok(None) => {}
            Err(e) => tracing::error!("reminder email for {user}: {e:?}"),
        }
    }
    Ok(sent)
}

/// A built reminder, before it has an address.
pub struct Reminder {
    pub subject: String,
    pub text: String,
    pub html: String,
    pub unsubscribe: String,
}

impl Reminder {
    pub fn to_email<'a>(&'a self, to: &'a str) -> Email<'a> {
        Email {
            to,
            subject: &self.subject,
            text: self.text.clone(),
            html: self.html.clone(),
            unsubscribe: Some(self.unsubscribe.clone()),
        }
    }
}

pub fn unsubscribe_url(token: &str) -> String {
    format!(
        "{}/api/email/unsubscribe?token={token}",
        features().public_url
    )
}

/// The email for a user: one section per trading account with trades. None when no account
/// has trades yet.
pub async fn build(
    pool: &PgPool,
    user: &str,
    tz: &str,
    weekly: bool,
    token: &str,
) -> Result<Option<Reminder>, crate::error::ApiError> {
    let accounts: Vec<(Uuid, String)> = sqlx::query_as(
        "select id, name from trading_accounts where user_id = $1 order by created_at",
    )
    .bind(user)
    .fetch_all(pool)
    .await?;
    let mut plans = Vec::new();
    for (id, name) in accounts {
        if let Some(p) = crate::today::plan_for(pool, user, id, tz.into()).await? {
            plans.push((name, p));
        }
    }
    let Some((_, first)) = plans.first() else {
        return Ok(None);
    };
    let subject = if plans.len() == 1 {
        format!("{}: {}", first.verdict.label, first.date)
    } else {
        format!("Your plan for {}", first.date)
    };
    let unsubscribe = unsubscribe_url(token);
    let site = &features().public_url;
    let mut text = String::new();
    let mut html = String::from(
        "<div style=\"font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;color:#1c1917\">",
    );
    for (name, p) in &plans {
        section(&mut text, &mut html, name, p, weekly, plans.len() > 1);
    }
    text.push_str(&format!(
        "\nOpen Jurno: {site}\nStop these emails: {unsubscribe}\n"
    ));
    html.push_str(&format!(
        "<p style=\"margin-top:24px;font-size:13px;color:#78716c\"><a href=\"{site}\" style=\"color:#78716c\">Open Jurno</a> · \
         <a href=\"{u}\" style=\"color:#78716c\">Stop these emails</a></p></div>",
        site = esc(site),
        u = esc(&unsubscribe),
    ));
    Ok(Some(Reminder {
        subject,
        text,
        html,
        unsubscribe,
    }))
}

fn section(
    text: &mut String,
    html: &mut String,
    name: &str,
    p: &TodayPlan,
    weekly: bool,
    named: bool,
) {
    let trades = match (p.rest, p.left, p.limits.trades) {
        (true, _, _) => "0 trades today".to_string(),
        (_, Some(left), Some(cap)) => format!("{left} of {} left", plural(cap, "trade")),
        _ => format!("{} today, no trade limit", plural(p.trades, "trade")),
    };
    let pnl = (p.trades > 0).then(|| format!(" · {} today", money(p.day_net, true)));
    if named {
        text.push_str(&format!("{name}\n"));
    }
    text.push_str(&format!(
        "{}\n{}\n{trades}{}\n",
        p.verdict.label,
        p.verdict.why,
        pnl.clone().unwrap_or_default()
    ));
    let color = match p.verdict.tone {
        Some(engine::today::Tone::Profit) => "#15803d",
        Some(engine::today::Tone::Loss) => "#b91c1c",
        None => "#1c1917",
    };
    html.push_str(
        "<div style=\"border:1px solid #e7e5e4;border-radius:12px;padding:20px;margin-top:16px\">",
    );
    if named {
        html.push_str(&format!(
            "<p style=\"margin:0;font-size:12px;color:#78716c\">{}</p>",
            esc(name)
        ));
    }
    html.push_str(&format!(
        "<p style=\"margin:4px 0 0;font-size:12px;color:#78716c\">Today, {}</p>\
         <h1 style=\"margin:4px 0;font-size:26px;color:{color}\">{}</h1>\
         <p style=\"margin:0;font-size:14px;color:#57534e\">{}</p>\
         <p style=\"margin:16px 0 0;font-size:15px\"><b>{}</b>{}</p>",
        esc(&p.date),
        esc(&p.verdict.label),
        esc(&p.verdict.why),
        esc(&trades),
        esc(&pnl.unwrap_or_default()),
    ));
    if !p.rules.is_empty() {
        text.push_str("\nYour rules today\n");
        html.push_str("<p style=\"margin:16px 0 4px;font-size:12px;color:#78716c\">Your rules today</p><ul style=\"margin:0;padding-left:18px;font-size:14px\">");
        for r in &p.rules {
            let note = r
                .note
                .as_ref()
                .map(|n| format!(" ({n})"))
                .unwrap_or_default();
            text.push_str(&format!("- {}{note}\n", r.text));
            html.push_str(&format!(
                "<li style=\"margin:4px 0\">{}{}</li>",
                esc(&r.text),
                esc(&note)
            ));
        }
        html.push_str("</ul>");
    }
    if !p.rest && !p.stop && !p.questions.is_empty() {
        text.push_str("\nBefore each trade\n");
        html.push_str("<p style=\"margin:16px 0 4px;font-size:12px;color:#78716c\">Before each trade</p><ul style=\"margin:0;padding-left:18px;font-size:14px\">");
        for q in &p.questions {
            text.push_str(&format!("- {q}\n"));
            html.push_str(&format!("<li style=\"margin:4px 0\">{}</li>", esc(q)));
        }
        html.push_str("</ul>");
    }
    if weekly && (!p.best_weekdays.is_empty() || !p.skip_weekdays.is_empty()) {
        let mut week = Vec::new();
        if !p.best_weekdays.is_empty() {
            week.push(format!(
                "Your best days are {}.",
                and_list(&p.best_weekdays)
            ));
        }
        if !p.skip_weekdays.is_empty() {
            week.push(format!("Your plan skips {}.", and_list(&p.skip_weekdays)));
        }
        let week = week.join(" ");
        text.push_str(&format!("\nThis week\n{week}\n"));
        html.push_str(&format!(
            "<p style=\"margin:16px 0 4px;font-size:12px;color:#78716c\">This week</p><p style=\"margin:0;font-size:14px\">{}</p>",
            esc(&week)
        ));
    }
    html.push_str("</div>");
    text.push('\n');
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frequency_days() {
        let mon = NaiveDate::from_ymd_opt(2026, 10, 26).unwrap();
        let sat = NaiveDate::from_ymd_opt(2026, 10, 31).unwrap();
        let tue = NaiveDate::from_ymd_opt(2026, 10, 27).unwrap();
        assert!(sends_on("weekdays", mon) && !sends_on("weekdays", sat));
        assert!(sends_on("daily", sat));
        assert!(sends_on("weekly", mon) && !sends_on("weekly", tue));
    }
}
