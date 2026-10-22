//! The journal (docs/journal-data.md): setups and mistake tags per person, trade and day reviews
//! per trading account, the journal with positions and R, and the summary. The engine computes
//! positions, R and the summary.

use std::collections::HashMap;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, NaiveDate, Utc};
use engine::journal::{DayFacts, ReviewFacts};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use super::accounts::owned_account;
use super::analytics::parse_tz;
use super::cash_flows::TzQuery;
use crate::auth::UserId;
use crate::error::{ApiError, ApiResult};
use crate::extract::{Json, Query};
use crate::plan::Plan;
use crate::trade_row::load_trades;

const NAME_MAX: usize = 40;
const NOTE_MAX: usize = 500;
const RISKS: [&str; 4] = ["tired", "news", "distracted", "chasing"];
const GROUPS: [&str; 4] = ["entry", "exit", "size", "mindset"];
/// Created for every person on first use, in this order.
const PRESETS: [(&str, &[&str]); 4] = [
    ("entry", &["FOMO", "Late entry", "No setup", "Revenge"]),
    ("exit", &["Early exit", "Held too long", "Moved stop"]),
    ("size", &["Oversized", "No stop"]),
    ("mindset", &["Tired", "Distracted", "Bored"]),
];

const NO_SETUP: ApiError = ApiError::NotFound("This setup does not exist.");
const NO_MISTAKE: ApiError = ApiError::NotFound("This mistake tag does not exist.");
const NO_TRADE: ApiError = ApiError::NotFound("This trade does not exist.");

fn bad(msg: impl Into<String>) -> ApiError {
    ApiError::bad_request(msg)
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

#[derive(Serialize, FromRow)]
pub struct Setup {
    id: Uuid,
    name: String,
    archived: bool,
}

#[derive(Serialize, FromRow)]
pub struct MistakeTag {
    id: Uuid,
    name: String,
    #[sqlx(rename = "grp")]
    group: String,
    preset: bool,
    archived: bool,
}

const SETUP_COLUMNS: &str = "id, name, archived";
const MISTAKE_COLUMNS: &str = "id, name, grp, preset, archived";

/// Creates the preset mistake tags the first time a person needs their tags.
async fn ensure_presets(pool: &PgPool, user: &str) -> ApiResult<()> {
    let mut tx = pool.begin().await?;
    // Two first requests at once must not both create the presets.
    sqlx::query("select pg_advisory_xact_lock(hashtext($1))")
        .bind(format!("presets:{user}"))
        .execute(&mut *tx)
        .await?;
    let (names, groups): (Vec<&str>, Vec<&str>) = PRESETS
        .iter()
        .flat_map(|(g, names)| names.iter().map(move |n| (*n, *g)))
        .unzip();
    // created_at steps by a microsecond so the list keeps the preset order.
    sqlx::query(
        "insert into mistake_tags (user_id, name, grp, preset, created_at)
         select $1, n, g, true, now() + i * interval '1 microsecond'
         from unnest($2::text[], $3::text[]) with ordinality as x(n, g, i)
         where not exists (select 1 from mistake_tags where user_id = $1)",
    )
    .bind(user)
    .bind(names)
    .bind(groups)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn tags(State(pool): State<PgPool>, UserId(user): UserId) -> ApiResult<Json<Value>> {
    ensure_presets(&pool, &user).await?;
    let setups: Vec<Setup> = sqlx::query_as(&format!(
        "select {SETUP_COLUMNS} from setups where user_id = $1 order by created_at, id"
    ))
    .bind(&user)
    .fetch_all(&pool)
    .await?;
    let mistakes: Vec<MistakeTag> = sqlx::query_as(&format!(
        "select {MISTAKE_COLUMNS} from mistake_tags where user_id = $1 order by created_at, id"
    ))
    .bind(&user)
    .fetch_all(&pool)
    .await?;
    Ok(Json(json!({ "setups": setups, "mistakes": mistakes })))
}

/// Trims and collapses spaces. 1 to 40 characters.
fn clean_name(name: &str) -> ApiResult<String> {
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return Err(bad("Type a name."));
    }
    if name.chars().count() > NAME_MAX {
        return Err(bad(format!("A name can be up to {NAME_MAX} characters.")));
    }
    Ok(name)
}

/// A person cannot have two active tags of one kind with the same name (any case).
/// `table` is `setups` or `mistake_tags`, never user input.
async fn check_unique(
    pool: &PgPool,
    table: &str,
    user: &str,
    name: &str,
    except: Option<Uuid>,
) -> ApiResult<()> {
    let same: Option<String> = sqlx::query_scalar(&format!(
        "select name from {table} where user_id = $1 and not archived and lower(name) = lower($2)
         and id is distinct from $3 limit 1"
    ))
    .bind(user)
    .bind(name)
    .bind(except)
    .fetch_optional(pool)
    .await?;
    match same {
        Some(s) => Err(bad(format!("You already have “{s}”."))),
        None => Ok(()),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NewSetup {
    name: String,
}

pub async fn create_setup(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Json(body): Json<NewSetup>,
) -> ApiResult<Json<Setup>> {
    let name = clean_name(&body.name)?;
    check_unique(&pool, "setups", &user, &name, None).await?;
    let row = sqlx::query_as(&format!(
        "insert into setups (user_id, name) values ($1, $2) returning {SETUP_COLUMNS}"
    ))
    .bind(&user)
    .bind(name)
    .fetch_one(&pool)
    .await?;
    Ok(Json(row))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NewMistake {
    name: String,
    group: String,
}

pub async fn create_mistake(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Json(body): Json<NewMistake>,
) -> ApiResult<Json<MistakeTag>> {
    if !GROUPS.contains(&body.group.as_str()) {
        return Err(bad(format!("The group must be {}.", GROUPS.join(", "))));
    }
    let name = clean_name(&body.name)?;
    ensure_presets(&pool, &user).await?;
    check_unique(&pool, "mistake_tags", &user, &name, None).await?;
    let row = sqlx::query_as(&format!(
        "insert into mistake_tags (user_id, name, grp) values ($1, $2, $3) returning {MISTAKE_COLUMNS}"
    ))
    .bind(&user)
    .bind(name)
    .bind(body.group)
    .fetch_one(&pool)
    .await?;
    Ok(Json(row))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TagPatch {
    name: Option<String>,
    archived: Option<bool>,
}

/// Renames or archives a tag in `table` (`setups` or `mistake_tags`). 404 with `missing` when it is not theirs.
async fn patch_tag(
    pool: &PgPool,
    table: &str,
    user: &str,
    id: Uuid,
    body: TagPatch,
    missing: ApiError,
) -> ApiResult<()> {
    let current: Option<(String, bool)> = sqlx::query_as(&format!(
        "select name, archived from {table} where id = $1 and user_id = $2"
    ))
    .bind(id)
    .bind(user)
    .fetch_optional(pool)
    .await?;
    let (name, archived) = current.ok_or(missing)?;
    let name = match body.name {
        Some(n) => clean_name(&n)?,
        None => name,
    };
    let archived = body.archived.unwrap_or(archived);
    // An active tag (renamed, or restored) must not clash with another active one.
    if !archived {
        check_unique(pool, table, user, &name, Some(id)).await?;
    }
    sqlx::query(&format!(
        "update {table} set name = $1, archived = $2 where id = $3"
    ))
    .bind(name)
    .bind(archived)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn update_setup(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Json(body): Json<TagPatch>,
) -> ApiResult<Json<Setup>> {
    let id: Uuid = id.parse().map_err(|_| NO_SETUP)?;
    patch_tag(&pool, "setups", &user, id, body, NO_SETUP).await?;
    let row = sqlx::query_as(&format!("select {SETUP_COLUMNS} from setups where id = $1"))
        .bind(id)
        .fetch_one(&pool)
        .await?;
    Ok(Json(row))
}

pub async fn update_mistake(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Json(body): Json<TagPatch>,
) -> ApiResult<Json<MistakeTag>> {
    let id: Uuid = id.parse().map_err(|_| NO_MISTAKE)?;
    patch_tag(&pool, "mistake_tags", &user, id, body, NO_MISTAKE).await?;
    let row = sqlx::query_as(&format!(
        "select {MISTAKE_COLUMNS} from mistake_tags where id = $1"
    ))
    .bind(id)
    .fetch_one(&pool)
    .await?;
    Ok(Json(row))
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

#[derive(Serialize, FromRow, Default)]
#[serde(rename_all = "camelCase")]
pub struct TradeReview {
    ticket: String,
    followed_plan: Option<bool>,
    setup_id: Option<Uuid>,
    grade: Option<String>,
    mood: Option<i16>,
    mistake_ids: Vec<Uuid>,
    no_mistakes: bool,
    initial_stop: Option<f64>,
    initial_target: Option<f64>,
    note: Option<String>,
    updated_at: DateTime<Utc>,
}

impl TradeReview {
    /// Blank means not answered: null, an empty list, or `false` for the None flag.
    fn is_blank(&self) -> bool {
        self.followed_plan.is_none()
            && self.setup_id.is_none()
            && self.grade.is_none()
            && self.mood.is_none()
            && self.mistake_ids.is_empty()
            && !self.no_mistakes
            && self.initial_stop.is_none()
            && self.initial_target.is_none()
            && self.note.is_none()
    }
}

const TRADE_REVIEW_SELECT: &str = "select r.ticket, r.followed_plan, r.setup_id, r.grade, r.mood,
    coalesce((select array_agg(m.mistake_id order by m.mistake_id) from trade_mistakes m
              where m.account_id = r.account_id and m.ticket = r.ticket), '{}') as mistake_ids,
    r.no_mistakes, r.initial_stop, r.initial_target, r.note, r.updated_at
    from trade_reviews r where r.account_id = $1";

#[derive(Serialize, FromRow, Default)]
#[serde(rename_all = "camelCase")]
pub struct DayReview {
    day: NaiveDate,
    pre_mood: Option<i16>,
    risks: Vec<String>,
    no_risks: bool,
    watch_setup_ids: Vec<Uuid>,
    followed_plan: Option<bool>,
    note: Option<String>,
    updated_at: DateTime<Utc>,
}

impl DayReview {
    fn is_blank(&self) -> bool {
        self.pre_mood.is_none()
            && self.risks.is_empty()
            && !self.no_risks
            && self.watch_setup_ids.is_empty()
            && self.followed_plan.is_none()
            && self.note.is_none()
    }
}

const DAY_REVIEW_SELECT: &str =
    "select day, pre_mood, risks, no_risks, watch_setup_ids, followed_plan, note, updated_at
    from day_reviews where account_id = $1";

// Field checks for PATCH bodies. Each takes the JSON value of one field.

fn opt_bool(v: &Value, field: &str) -> ApiResult<Option<bool>> {
    match v {
        Value::Null => Ok(None),
        Value::Bool(b) => Ok(Some(*b)),
        _ => Err(bad(format!("{field} must be true, false or null."))),
    }
}

fn flag(v: &Value, field: &str) -> ApiResult<bool> {
    v.as_bool()
        .ok_or_else(|| bad(format!("{field} must be true or false.")))
}

fn mood(v: &Value) -> ApiResult<Option<i16>> {
    match v {
        Value::Null => Ok(None),
        _ => match v.as_i64() {
            Some(m @ 1..=5) => Ok(Some(m as i16)),
            _ => Err(bad("The mood must be a number from 1 to 5.")),
        },
    }
}

fn price(v: &Value, what: &str) -> ApiResult<Option<f64>> {
    match v {
        Value::Null => Ok(None),
        _ => match v.as_f64() {
            Some(p) if p.is_finite() && p > 0.0 => Ok(Some(p)),
            _ => Err(bad(format!("The {what} must be a price above 0."))),
        },
    }
}

/// Trimmed; empty is null.
fn note(v: &Value) -> ApiResult<Option<String>> {
    match v {
        Value::Null => Ok(None),
        Value::String(s) if s.chars().count() > NOTE_MAX => {
            Err(bad(format!("A note can be up to {NOTE_MAX} characters.")))
        }
        Value::String(s) => Ok(Some(s.trim().to_string()).filter(|s| !s.is_empty())),
        _ => Err(bad("The note must be text.")),
    }
}

/// A list of ids, without repeats, that all exist in `table` for this person.
async fn owned_ids(
    pool: &PgPool,
    v: &Value,
    table: &str,
    user: &str,
    missing: &str,
) -> ApiResult<Vec<Uuid>> {
    let list = v
        .as_array()
        .ok_or_else(|| bad(format!("{missing} Send a list.")))?;
    let mut ids: Vec<Uuid> = Vec::new();
    for x in list {
        let id = x
            .as_str()
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| bad(missing.to_string()))?;
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    let found: i64 = sqlx::query_scalar(&format!(
        "select count(*) from {table} where user_id = $1 and id = any($2)"
    ))
    .bind(user)
    .bind(&ids)
    .fetch_one(pool)
    .await?;
    if found as usize != ids.len() {
        return Err(bad(missing.to_string()));
    }
    Ok(ids)
}

/// Fields left out are kept; null clears. All answers blank deletes the review (204).
pub async fn patch_trade(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path((id, ticket)): Path<(String, String)>,
    Json(body): Json<Map<String, Value>>,
) -> ApiResult<Response> {
    let id = owned_account(&pool, &user, &id).await?;
    let exists: bool = sqlx::query_scalar(
        "select exists (select 1 from trades where account_id = $1 and ticket = $2)",
    )
    .bind(id)
    .bind(&ticket)
    .fetch_one(&pool)
    .await?;
    if !exists {
        return Err(NO_TRADE);
    }
    let mut r: TradeReview = sqlx::query_as(&format!("{TRADE_REVIEW_SELECT} and r.ticket = $2"))
        .bind(id)
        .bind(&ticket)
        .fetch_optional(&pool)
        .await?
        .unwrap_or_default();
    for (k, v) in &body {
        match k.as_str() {
            "followedPlan" => r.followed_plan = opt_bool(v, k)?,
            "setupId" => {
                r.setup_id = match v {
                    Value::Null => None,
                    _ => Some(
                        *owned_ids(
                            &pool,
                            &json!([v]),
                            "setups",
                            &user,
                            "This setup does not exist.",
                        )
                        .await?
                        .first()
                        .unwrap(),
                    ),
                }
            }
            "grade" => {
                r.grade = match v.as_str() {
                    _ if v.is_null() => None,
                    Some(g @ ("A" | "B" | "C")) => Some(g.into()),
                    _ => return Err(bad("The grade must be A, B or C.")),
                }
            }
            "mood" => r.mood = mood(v)?,
            "mistakeIds" => {
                r.mistake_ids = owned_ids(
                    &pool,
                    v,
                    "mistake_tags",
                    &user,
                    "A mistake tag does not exist.",
                )
                .await?
            }
            "noMistakes" => r.no_mistakes = flag(v, k)?,
            "initialStop" => r.initial_stop = price(v, "starting stop")?,
            "initialTarget" => r.initial_target = price(v, "take profit")?,
            "note" => r.note = note(v)?,
            _ => return Err(bad(format!("Unknown field: {k}."))),
        }
    }
    if r.no_mistakes && !r.mistake_ids.is_empty() {
        return Err(bad("Pick mistakes or None, not both."));
    }

    let mut tx = pool.begin().await?;
    if r.is_blank() {
        sqlx::query("delete from trade_reviews where account_id = $1 and ticket = $2")
            .bind(id)
            .bind(&ticket)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        return Ok(StatusCode::NO_CONTENT.into_response());
    }
    sqlx::query(
        "insert into trade_reviews (account_id, ticket, followed_plan, setup_id, grade, mood, no_mistakes,
            initial_stop, initial_target, note, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         on conflict (account_id, ticket) do update set followed_plan = excluded.followed_plan,
            setup_id = excluded.setup_id, grade = excluded.grade, mood = excluded.mood,
            no_mistakes = excluded.no_mistakes, initial_stop = excluded.initial_stop,
            initial_target = excluded.initial_target, note = excluded.note, updated_at = now()",
    )
    .bind(id)
    .bind(&ticket)
    .bind(r.followed_plan)
    .bind(r.setup_id)
    .bind(&r.grade)
    .bind(r.mood)
    .bind(r.no_mistakes)
    .bind(r.initial_stop)
    .bind(r.initial_target)
    .bind(&r.note)
    .execute(&mut *tx)
    .await?;
    sqlx::query("delete from trade_mistakes where account_id = $1 and ticket = $2")
        .bind(id)
        .bind(&ticket)
        .execute(&mut *tx)
        .await?;
    sqlx::query("insert into trade_mistakes (account_id, ticket, mistake_id) select $1, $2, unnest($3::uuid[])")
        .bind(id)
        .bind(&ticket)
        .bind(&r.mistake_ids)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let saved: TradeReview = sqlx::query_as(&format!("{TRADE_REVIEW_SELECT} and r.ticket = $2"))
        .bind(id)
        .bind(&ticket)
        .fetch_one(&pool)
        .await?;
    Ok(Json(saved).into_response())
}

/// Same rules as [`patch_trade`], for one day (yyyy-mm-dd in the dashboard timezone).
pub async fn patch_day(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path((id, day)): Path<(String, String)>,
    Json(body): Json<Map<String, Value>>,
) -> ApiResult<Response> {
    let id = owned_account(&pool, &user, &id).await?;
    let day = NaiveDate::parse_from_str(&day, "%Y-%m-%d")
        .map_err(|_| bad("The day must be yyyy-mm-dd."))?;
    let mut d: DayReview = sqlx::query_as(&format!("{DAY_REVIEW_SELECT} and day = $2"))
        .bind(id)
        .bind(day)
        .fetch_optional(&pool)
        .await?
        .unwrap_or_default();
    for (k, v) in &body {
        match k.as_str() {
            "preMood" => d.pre_mood = mood(v)?,
            "risks" => {
                let list = v.as_array().filter(|l| {
                    l.iter()
                        .all(|r| r.as_str().is_some_and(|r| RISKS.contains(&r)))
                });
                let list =
                    list.ok_or_else(|| bad(format!("Risks can be {}.", RISKS.join(", "))))?;
                // Stored in the fixed order, without repeats.
                d.risks = RISKS
                    .iter()
                    .filter(|r| list.iter().any(|x| x == **r))
                    .map(|r| r.to_string())
                    .collect();
            }
            "noRisks" => d.no_risks = flag(v, k)?,
            "watchSetupIds" => {
                d.watch_setup_ids =
                    owned_ids(&pool, v, "setups", &user, "A setup does not exist.").await?
            }
            "followedPlan" => d.followed_plan = opt_bool(v, k)?,
            "note" => d.note = note(v)?,
            _ => return Err(bad(format!("Unknown field: {k}."))),
        }
    }
    if d.no_risks && !d.risks.is_empty() {
        return Err(bad("Pick risks or None, not both."));
    }
    if d.is_blank() {
        sqlx::query("delete from day_reviews where account_id = $1 and day = $2")
            .bind(id)
            .bind(day)
            .execute(&pool)
            .await?;
        return Ok(StatusCode::NO_CONTENT.into_response());
    }
    let saved: DayReview = sqlx::query_as(
        "insert into day_reviews (account_id, day, pre_mood, risks, no_risks, watch_setup_ids, followed_plan, note, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now())
         on conflict (account_id, day) do update set pre_mood = excluded.pre_mood, risks = excluded.risks,
            no_risks = excluded.no_risks, watch_setup_ids = excluded.watch_setup_ids,
            followed_plan = excluded.followed_plan, note = excluded.note, updated_at = now()
         returning day, pre_mood, risks, no_risks, watch_setup_ids, followed_plan, note, updated_at",
    )
    .bind(id)
    .bind(day)
    .bind(d.pre_mood)
    .bind(&d.risks)
    .bind(d.no_risks)
    .bind(&d.watch_setup_ids)
    .bind(d.followed_plan)
    .bind(&d.note)
    .fetch_one(&pool)
    .await?;
    Ok(Json(saved).into_response())
}

// ---------------------------------------------------------------------------
// Journal and summary
// ---------------------------------------------------------------------------

/// The account's positions, reviews and day reviews, all loaded once.
struct Loaded {
    positions: Vec<engine::journal::Position>,
    reviews: Vec<TradeReview>,
    days: Vec<DayReview>,
}

async fn load(pool: &PgPool, user: &str, id: &str, tz: Option<String>) -> ApiResult<Loaded> {
    let tz = tz.filter(|t| !t.is_empty()).unwrap_or_else(|| "UTC".into());
    parse_tz(&tz)?;
    let id = owned_account(pool, user, id).await?;
    let trades = load_trades(pool, id).await?;
    let reviews: Vec<TradeReview> = sqlx::query_as(TRADE_REVIEW_SELECT)
        .bind(id)
        .fetch_all(pool)
        .await?;
    let days: Vec<DayReview> = sqlx::query_as(&format!("{DAY_REVIEW_SELECT} order by day desc"))
        .bind(id)
        .fetch_all(pool)
        .await?;
    let stops: HashMap<String, f64> = reviews
        .iter()
        .filter_map(|r| r.initial_stop.map(|s| (r.ticket.clone(), s)))
        .collect();
    let positions = engine::journal::positions(&trades, &stops, &tz);
    // A review whose trades were deleted stays stored but is not shown.
    let reviews = reviews
        .into_iter()
        .filter(|r| positions.iter().any(|p| p.ticket == r.ticket))
        .collect();
    Ok(Loaded {
        positions,
        reviews,
        days,
    })
}

/// `{ positions, trades, days, stats }`: positions newest first, stats for every day with a trade or a review.
pub async fn journal(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Query(q): Query<TzQuery>,
) -> ApiResult<Json<Value>> {
    let l = load(&pool, &user, &id, q.tz).await?;
    let review_days: Vec<String> = l.days.iter().map(|d| d.day.to_string()).collect();
    let stats = engine::journal::day_stats(&l.positions, &review_days);
    Ok(Json(
        json!({ "positions": l.positions, "trades": l.reviews, "days": l.days, "stats": stats }),
    ))
}

/// P&L by setup, grade, mistake, plan and mood. `{ locked: true }` on Free.
pub async fn summary(
    State(pool): State<PgPool>,
    UserId(user): UserId,
    Path(id): Path<String>,
    Query(q): Query<TzQuery>,
) -> ApiResult<Json<Value>> {
    let l = load(&pool, &user, &id, q.tz).await?;
    if !Plan::of(&pool, &user).await?.is_paid() {
        return Ok(Json(json!({ "locked": true })));
    }
    let facts: Vec<ReviewFacts> = l
        .reviews
        .iter()
        .map(|r| ReviewFacts {
            ticket: r.ticket.clone(),
            followed_plan: r.followed_plan,
            setup_id: r.setup_id.map(|s| s.to_string()),
            grade: r.grade.clone(),
            mistake_ids: r.mistake_ids.iter().map(Uuid::to_string).collect(),
            initial_stop: r.initial_stop,
        })
        .collect();
    let days: Vec<DayFacts> = l
        .days
        .iter()
        .map(|d| DayFacts {
            day: d.day.to_string(),
            pre_mood: d.pre_mood.map(|m| m as u8),
        })
        .collect();
    Ok(Json(json!(engine::journal::summary(
        &l.positions,
        &facts,
        &days
    ))))
}
