//! The Today card: what to do today, today's rules and questions to ask before each trade.
//!
//! One source for the card in the web app and the reminder email, so both always say the
//! same thing. The wording is built here (money, 12-hour times), not in the browser.

use chrono::{DateTime, Datelike, Timelike, Utc};
use chrono_tz::Tz;
use serde::{Deserialize, Serialize};

use crate::{Analytics, CapRow, FocusKind};

pub const WEEKDAYS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
pub const LONG_WEEKDAYS: [&str; 7] = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RiskKind {
    Percent,
    Amount,
}

/// The account's own limits (Configuration). `daily` and `per_trade` are a % of the balance
/// or dollars, by `kind`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountRisk {
    pub kind: RiskKind,
    pub daily: Option<f64>,
    pub per_trade: Option<f64>,
    /// Trade on Saturdays and Sundays.
    #[serde(default)]
    pub weekends: bool,
}

impl Default for AccountRisk {
    /// Used until the account has its own limits.
    fn default() -> Self {
        Self {
            kind: RiskKind::Percent,
            daily: Some(2.0),
            per_trade: Some(1.0),
            weekends: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LimitFrom {
    Account,
    Plan,
}

/// Today's limits in dollars and trades.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    /// Max loss today.
    pub daily: Option<f64>,
    /// Which limit set `daily`: the account's own, or the plan's (when it is smaller).
    pub from: Option<LimitFrom>,
    /// Max risk per trade.
    pub per_trade: Option<f64>,
    /// Max trades today.
    pub trades: Option<u32>,
}

/// Rounded down, so the advice never risks more than a limit: whole dollars from $100, cents below.
fn floor_money(n: f64) -> f64 {
    if n >= 100.0 {
        n.floor()
    } else {
        (n * 100.0).floor() / 100.0
    }
}

fn smallest(xs: &[Option<f64>]) -> Option<f64> {
    xs.iter().flatten().copied().reduce(f64::min)
}

/// Today's limits: the stricter of the account's loss limits and the plan's (found on past
/// trades). Trades a day come from the history only: the best daily cap on Frequency. A % limit
/// needs a balance above 0.
pub fn limits(
    risk: &AccountRisk,
    balance: Option<f64>,
    plan_loss_limit: Option<f64>,
    cap: Option<u32>,
) -> Limits {
    let bal = balance.filter(|b| *b > 0.0);
    let dollars = |v: Option<f64>| match (v, risk.kind) {
        (None, _) => None,
        (Some(v), RiskKind::Amount) => Some(v),
        (Some(v), RiskKind::Percent) => bal.map(|b| floor_money(b * v / 100.0)),
    };
    let own = dollars(risk.daily);
    let daily = smallest(&[own, plan_loss_limit]);
    let per_from_daily = match (daily, cap) {
        (Some(d), Some(c)) if c > 0 => Some(floor_money(d / c as f64)),
        _ => None,
    };
    Limits {
        daily,
        from: daily.map(|d| {
            if Some(d) == own {
                LimitFrom::Account
            } else {
                LimitFrom::Plan
            }
        }),
        per_trade: smallest(&[dollars(risk.per_trade), per_from_daily]),
        trades: cap,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tone {
    Profit,
    Loss,
}

/// The headline: an action and one reason.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Verdict {
    pub label: String,
    pub tone: Option<Tone>,
    pub why: String,
}

/// One rule for today: an action, an optional note on the right, and an optional warning under it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub text: String,
    pub note: Option<String>,
    pub warn: Option<String>,
    pub tone: Option<Tone>,
}

impl Rule {
    fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            note: None,
            warn: None,
            tone: None,
        }
    }
}

/// Everything the Today card and the reminder email say about today.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodayPlan {
    /// yyyy-mm-dd in the timezone.
    pub day: String,
    /// "Monday, October 26"
    pub date: String,
    /// 0 = Mon ... 6 = Sun
    pub weekday: u32,
    /// Trades taken today and their net.
    pub trades: u32,
    pub day_net: f64,
    pub limits: Limits,
    /// Trades left today. None without a trade cap.
    pub left: Option<u32>,
    /// A rest day: the weekend (when off) or a weekday the plan skips.
    pub rest: bool,
    /// The cap or the loss limit is hit.
    pub stop: bool,
    pub verdict: Verdict,
    pub rules: Vec<Rule>,
    /// Questions to answer before each trade.
    pub questions: Vec<String>,
    /// The plan's best weekdays and the ones it skips, long names. Empty without a plan.
    pub best_weekdays: Vec<String>,
    pub skip_weekdays: Vec<String>,
    /// The hour now (0-23), and the plan's best hours and the hours it skips.
    pub hour: u32,
    pub best_hours: Vec<u32>,
    pub skip_hours: Vec<u32>,
    /// The paid parts are left out (Free plan).
    pub locked: bool,
}

/// Today's local day, weekday (0 = Monday) and hour.
pub struct Clock {
    pub day: String,
    pub weekday: u32,
    pub hour: u32,
    pub minute: u32,
    pub date: String,
}

pub fn clock(now: DateTime<Utc>, tz: &str) -> Clock {
    let tz: Tz = tz.parse().unwrap_or(Tz::UTC);
    let t = now.with_timezone(&tz);
    Clock {
        day: t.format("%Y-%m-%d").to_string(),
        weekday: t.weekday().num_days_from_monday(),
        hour: t.hour(),
        minute: t.minute(),
        date: t.format("%A, %B %-d").to_string(),
    }
}

/// The plan for today. `a`: analytics of all the account's trades in `tz`. `locked`: the user is
/// on Free, so the paid parts of `a` are not used. `balance`: None when the account has no
/// deposits.
pub fn today_plan(
    a: &Analytics,
    locked: bool,
    now: DateTime<Utc>,
    tz: &str,
    balance: Option<f64>,
    risk: &AccountRisk,
) -> TodayPlan {
    let c = clock(now, tz);
    let (weekday, hour) = (c.weekday, c.hour);
    let done = a.daily.iter().find(|d| d.key == c.day);
    let n = done.map_or(0, |d| d.trades);
    let day_net = done.map_or(0.0, |d| d.net);
    let long_day = LONG_WEEKDAYS
        .get(weekday as usize)
        .copied()
        .unwrap_or("Today");
    let full = (!locked).then_some(a);
    let opt = full.and_then(|a| a.optimization.as_ref());
    let r = opt.map(|o| &o.rules);
    // Trades a day: the best cap on Frequency, so both pages agree.
    let cap = full.and_then(|a| best_cap(&a.cap_sim));
    let lim = limits(risk, balance, r.and_then(|r| r.loss_limit), cap);
    let weekend_off = weekday >= 5 && !risk.weekends;
    let rest = weekend_off || r.is_some_and(|r| r.skip_weekdays.contains(&weekday));
    let loss_hit = lim.daily.is_some_and(|d| day_net <= -d);
    // A rest day or a hit loss limit leaves no trades, whatever the cap says.
    let left = if rest || loss_hit {
        Some(0)
    } else {
        lim.trades.map(|t| t.saturating_sub(n))
    };

    let keys = |kind: FocusKind| -> Vec<String> {
        opt.and_then(|o| o.focus.iter().find(|f| f.kind == kind))
            .map(|f| f.keys.clone())
            .unwrap_or_default()
    };
    let best_hours: Vec<u32> = keys(FocusKind::Hour)
        .iter()
        .filter_map(|k| k.parse().ok())
        .collect();
    let weekday_key = WEEKDAYS[weekday as usize];
    let wd = full.and_then(|a| a.by_weekday.iter().find(|g| g.key == weekday_key));
    let record = match wd {
        Some(g) if g.trades > 0 && g.net >= 0.0 => {
            format!("{long_day}s made you {}.", money(g.net, true))
        }
        Some(g) if g.trades > 0 => format!("{long_day}s lost you {}.", money(-g.net, false)),
        _ => format!("You have no {long_day} trades yet."),
    };

    let verdict = |label: &str, tone: Option<Tone>, why: String| Verdict {
        label: label.into(),
        tone,
        why,
    };
    let verdict = if let Some(t) = lim.trades.filter(|t| !rest && n >= *t) {
        verdict(
            "Stop trading",
            Some(Tone::Loss),
            format!("You took all {} for today.", plural(t, "trade")),
        )
    } else if loss_hit {
        verdict(
            "Stop trading",
            Some(Tone::Loss),
            format!(
                "You lost {}. Your limit was {}.",
                money(-day_net, false),
                money(lim.daily.unwrap_or(0.0), false)
            ),
        )
    } else if rest {
        if weekend_off {
            verdict(
                "Rest today",
                Some(Tone::Loss),
                "Weekends are off. Turn them on in Configuration.".into(),
            )
        } else {
            let lost = match wd {
                Some(g) if g.trades > 0 && g.net < 0.0 => {
                    format!(" They lost you {}.", money(-g.net, false))
                }
                _ => String::new(),
            };
            verdict(
                "Rest today",
                Some(Tone::Loss),
                format!("Your plan skips {long_day}s.{lost}"),
            )
        }
    } else if keys(FocusKind::Weekday).iter().any(|k| k == weekday_key) {
        verdict("Good day to trade", Some(Tone::Profit), record)
    } else {
        let why = if opt.is_some() {
            record
        } else if locked {
            "Upgrade to see your best days and hours.".into()
        } else {
            "Your plan needs 30 trades over 10 days.".into()
        };
        verdict("Trade your plan", None, why)
    };

    // The rules, as actions. A % limit on a tiny balance gives limits too small to use: say so.
    let mut rules = Vec::new();
    if let Some(daily) = lim.daily {
        let pct_of = lim.from == Some(LimitFrom::Account) && risk.kind == RiskKind::Percent;
        let pct_of = pct_of.then_some(balance).flatten();
        let mut rule = Rule::new(format!("Stop if you lose {}", money(daily, false)));
        rule.note = Some(match (lim.from, pct_of) {
            (Some(LimitFrom::Plan), _) => "From your history".into(),
            (_, Some(b)) => format!("{}% of {}", num(risk.daily.unwrap_or(0.0)), money(b, false)),
            _ => "Your limit".into(),
        });
        if let Some(b) = pct_of.filter(|_| daily < 1.0) {
            rule.warn = Some(format!(
                "Is {} your balance? Check Funding, or set dollar limits in Configuration.",
                money(b, false)
            ));
        }
        rules.push(rule);
    } else if let (RiskKind::Percent, Some(d)) = (risk.kind, risk.daily) {
        let mut rule = Rule::new("Add your deposits to set a loss limit");
        rule.note = Some(format!("{}% of balance", num(d)));
        rules.push(rule);
    }
    let per_trade = lim.per_trade.filter(|p| *p >= 1.0);
    if let Some(p) = per_trade {
        rules.push(Rule::new(format!("Risk up to {} a trade", money(p, false))));
    }
    if !best_hours.is_empty() {
        let mut rule = Rule::new(format!("Trade at {}", hour_list(&best_hours)));
        if best_hours.contains(&hour) {
            rule.warn = Some(format!("It is {}. Good time.", hour_label(hour)));
            rule.tone = Some(Tone::Profit);
        }
        rules.push(rule);
    }
    if let Some(skip) = r.map(|r| &r.skip_hours).filter(|h| !h.is_empty()) {
        let mut rule = Rule::new(format!("Avoid {}", hour_list(skip)));
        if skip.contains(&hour) {
            rule.warn = Some(format!("It is {}. Wait.", hour_label(hour)));
            rule.tone = Some(Tone::Loss);
        }
        rules.push(rule);
    }
    let symbol = keys(FocusKind::Symbol).into_iter().next();
    let hold = keys(FocusKind::Duration).into_iter().next();
    match (&symbol, &hold) {
        (Some(s), Some(h)) => rules.push(Rule::new(format!("Trade {s} and hold {h}"))),
        (Some(s), None) => rules.push(Rule::new(format!("Trade {s}"))),
        (None, Some(h)) => rules.push(Rule::new(format!("Hold {h}"))),
        (None, None) => {}
    }

    // Questions to answer before each trade.
    let mut questions = Vec::new();
    if !best_hours.is_empty() {
        questions.push("Is it a good hour?".to_string());
    }
    if let Some(p) = per_trade {
        questions.push(format!("Does this trade risk {} or less?", money(p, false)));
    }
    if let Some(al) = full.map(|a| &a.after_loss) {
        if al.after.trades >= 5 && al.after.avg < al.other.avg {
            questions.push(format!(
                "Did {} min pass since your last loss?",
                al.window_min
            ));
        }
    }

    let long_names = |keys: Vec<String>| -> Vec<String> {
        keys.iter()
            .filter_map(|k| WEEKDAYS.iter().position(|w| w == k))
            .map(|i| LONG_WEEKDAYS[i].to_string())
            .collect()
    };
    let stop = verdict.label == "Stop trading";
    TodayPlan {
        day: c.day,
        date: c.date,
        weekday,
        trades: n,
        day_net,
        limits: lim,
        left,
        rest,
        stop,
        verdict,
        rules,
        questions,
        best_weekdays: long_names(keys(FocusKind::Weekday)),
        skip_weekdays: r
            .map(|r| {
                r.skip_weekdays
                    .iter()
                    .filter_map(|d| LONG_WEEKDAYS.get(*d as usize))
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default(),
        hour,
        skip_hours: r.map(|r| r.skip_hours.clone()).unwrap_or_default(),
        best_hours,
        locked,
    }
}

/// The cap with the highest net; the first one wins a tie.
fn best_cap(rows: &[CapRow]) -> Option<u32> {
    rows.iter()
        .fold(None::<&CapRow>, |b, c| match b {
            Some(b) if c.net <= b.net => Some(b),
            _ => Some(c),
        })
        .map(|r| r.cap)
}

// ---------------------------------------------------------------------------
// Wording helpers, the same as apps/web/src/lib/format.ts
// ---------------------------------------------------------------------------

/// "$1,234.56", "−$5.00", or "+$5.00" with `sign`.
pub fn money(n: f64, sign: bool) -> String {
    let cents = (n.abs() * 100.0).round() as u64;
    let whole = (cents / 100).to_string();
    let mut grouped = String::new();
    for (i, ch) in whole.chars().enumerate() {
        if i > 0 && (whole.len() - i).is_multiple_of(3) {
            grouped.push(',');
        }
        grouped.push(ch);
    }
    let s = format!("${grouped}.{:02}", cents % 100);
    if n < 0.0 && cents > 0 {
        format!("\u{2212}{s}")
    } else if sign && n > 0.0 && cents > 0 {
        format!("+{s}")
    } else {
        s
    }
}

/// A number without trailing zeros: 2 → "2", 1.5 → "1.5".
pub fn num(n: f64) -> String {
    let s = format!("{:.4}", n);
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

pub fn plural(n: u32, word: &str) -> String {
    format!("{n} {word}{}", if n == 1 { "" } else { "s" })
}

/// 12-hour clock: 0 → "12 AM", 13 → "1 PM".
pub fn hour_label(h: u32) -> String {
    let h = h % 24;
    let twelve = if h.is_multiple_of(12) { 12 } else { h % 12 };
    format!("{twelve} {}", if h < 12 { "AM" } else { "PM" })
}

/// "a", "a and b", "a, b and c".
pub fn and_list(xs: &[String]) -> String {
    match xs {
        [] => String::new(),
        [one] => one.clone(),
        [rest @ .., last] => format!("{} and {last}", rest.join(", ")),
    }
}

/// Hours as ranges: [20, 21, 22, 9] → "9 AM and 8 PM to 11 PM". A range ends when its last
/// hour ends.
pub fn hour_list(hours: &[u32]) -> String {
    let mut sorted = hours.to_vec();
    sorted.sort_unstable();
    sorted.dedup();
    let mut runs: Vec<(u32, u32)> = Vec::new();
    for h in sorted {
        match runs.last_mut() {
            Some(last) if h == last.1 + 1 => last.1 = h,
            _ => runs.push((h, h)),
        }
    }
    let parts: Vec<String> = runs
        .iter()
        .map(|&(a, b)| {
            if a == b {
                hour_label(a)
            } else {
                format!("{} to {}", hour_label(a), hour_label((b + 1) % 24))
            }
        })
        .collect();
    and_list(&parts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn money_matches_the_web_format() {
        assert_eq!(money(1234.5, false), "$1,234.50");
        assert_eq!(money(-5.0, false), "\u{2212}$5.00");
        assert_eq!(money(5.0, true), "+$5.00");
        assert_eq!(money(0.0, true), "$0.00");
        assert_eq!(money(1_000_000.0, false), "$1,000,000.00");
        assert_eq!(money(999.999, false), "$1,000.00");
    }

    #[test]
    fn hours_as_ranges() {
        assert_eq!(hour_list(&[20, 21, 22, 9]), "9 AM and 8 PM to 11 PM");
        assert_eq!(hour_list(&[0]), "12 AM");
        assert_eq!(hour_list(&[23]), "11 PM");
        assert_eq!(hour_list(&[22, 23]), "10 PM to 12 AM");
        assert_eq!(hour_list(&[1, 3, 5]), "1 AM, 3 AM and 5 AM");
    }

    #[test]
    fn limits_pick_the_stricter() {
        let risk = AccountRisk::default(); // 2% a day, 1% a trade
        let l = limits(&risk, Some(1000.0), Some(50.0), Some(4));
        assert_eq!(l.daily, Some(20.0));
        assert_eq!(l.from, Some(LimitFrom::Account));
        assert_eq!(l.per_trade, Some(5.0)); // min(10, 20 / 4)
        let l = limits(&risk, Some(1000.0), Some(15.0), None);
        assert_eq!(l.daily, Some(15.0));
        assert_eq!(l.from, Some(LimitFrom::Plan));
        // A % limit needs a balance.
        let l = limits(&risk, None, None, Some(3));
        assert_eq!((l.daily, l.per_trade, l.trades), (None, None, Some(3)));
        let dollars = AccountRisk {
            kind: RiskKind::Amount,
            daily: Some(30.0),
            per_trade: None,
            weekends: true,
        };
        assert_eq!(limits(&dollars, None, None, None).daily, Some(30.0));
        // Rounded down.
        assert_eq!(limits(&risk, Some(333.33), None, None).daily, Some(6.66));
    }
}
