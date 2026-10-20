//! Admin commands for the `api` binary: `api users`, `api plan <username> <plan>`,
//! `api owner <username>`. Run them locally with `just`, or on Railway over SSH.

use sqlx::{FromRow, PgPool};

use crate::plan::Plan;

pub const USAGE: &str = "\
Usage:
  api                          Start the server
  api users                    List users with their plan, accounts and trades
  api plan <username> <plan>   Put a user on a plan: free, espresso, latte or owner
  api owner <username>         Give a user the owner plan: everything, no account limit";

/// Runs an admin command. Returns the text to print, or an error message.
pub async fn run(pool: &PgPool, args: &[String]) -> Result<String, String> {
    match args {
        [cmd] if cmd == "users" => users(pool).await,
        [cmd, user, plan] if cmd == "plan" => set_plan(pool, user, plan).await,
        [cmd, user] if cmd == "owner" => set_plan(pool, user, "owner").await,
        _ => Err(USAGE.into()),
    }
}

/// Puts a user on a plan. Usernames are matched in lower case, as Better Auth stores them.
pub async fn set_plan(pool: &PgPool, username: &str, plan: &str) -> Result<String, String> {
    let plan = Plan::from_name(plan).ok_or("Use free, espresso, latte or owner.")?;
    let updated: Option<String> = sqlx::query_scalar(
        r#"insert into profiles (user_id, plan)
           select id, $2 from "user" where username = lower($1)
           on conflict (user_id) do update set plan = excluded.plan
           returning plan"#,
    )
    .bind(username)
    .bind(plan.name())
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {e}"))?;
    match updated {
        Some(p) => Ok(format!(
            "{username} is now on {p}. They see it on their next page load."
        )),
        None => Err(format!(
            "No user named {username}. They must sign up first."
        )),
    }
}

#[derive(FromRow)]
struct UserRow {
    username: String,
    plan: String,
    accounts: i64,
    trades: i64,
}

/// Lists every user with plan, trading account count and trade count.
async fn users(pool: &PgPool) -> Result<String, String> {
    let rows: Vec<UserRow> = sqlx::query_as(
        r#"select coalesce(u."displayUsername", u.username, u.name) as username,
                  coalesce(p.plan, 'free') as plan,
                  (select count(*) from trading_accounts a where a.user_id = u.id) as accounts,
                  (select count(*) from trades t join trading_accounts a on a.id = t.account_id
                    where a.user_id = u.id) as trades
           from "user" u left join profiles p on p.user_id = u.id
           order by u.username"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Database error: {e}"))?;
    if rows.is_empty() {
        return Ok("No users yet.".into());
    }
    let mut out = format!(
        "{:<24} {:<9} {:>8} {:>8}",
        "USERNAME", "PLAN", "ACCOUNTS", "TRADES"
    );
    for r in rows {
        out += &format!(
            "\n{:<24} {:<9} {:>8} {:>8}",
            r.username, r.plan, r.accounts, r.trades
        );
    }
    Ok(out)
}
