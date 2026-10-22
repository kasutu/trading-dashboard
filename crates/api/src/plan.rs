//! Plans and what each one unlocks. Keep in sync with docs/architecture.md (Plans)
//! and apps/web/src/lib/plans.ts.

use serde_json::Value;
use sqlx::PgPool;

use crate::error::ApiResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Plan {
    Free,
    Espresso,
    Latte,
    /// The creator's plan: everything, no account limit. Not sold, not on the pricing page.
    Owner,
}

/// Analytics fields that only paid plans get: timing statistics, recommendations
/// and everything that simulates or optimizes the user's trading.
pub const PAID_FIELDS: [&str; 11] = [
    "byHour",
    "byWeekday",
    "heatmap",
    "byDuration",
    "nthTrade",
    "dayBuckets",
    "capSim",
    "lossLimitSim",
    "afterLoss",
    "overtrading",
    "optimization",
];

impl Plan {
    fn parse(s: &str) -> Self {
        match s {
            "espresso" => Self::Espresso,
            "latte" => Self::Latte,
            "owner" => Self::Owner,
            _ => Self::Free,
        }
    }

    /// Strict version of `parse` for admin commands: unknown names are an error, not Free.
    pub fn from_name(s: &str) -> Option<Self> {
        match s {
            "free" => Some(Self::Free),
            "espresso" => Some(Self::Espresso),
            "latte" => Some(Self::Latte),
            "owner" => Some(Self::Owner),
            _ => None,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::Free => "free",
            Self::Espresso => "espresso",
            Self::Latte => "latte",
            Self::Owner => "owner",
        }
    }

    pub fn is_paid(self) -> bool {
        self != Self::Free
    }

    pub fn max_accounts(self) -> i64 {
        match self {
            Self::Latte => 5,
            Self::Owner => i64::MAX,
            _ => 1,
        }
    }

    /// The user's plan. A user without a profile row is on Free.
    pub async fn of(pool: &PgPool, user: &str) -> ApiResult<Self> {
        let plan: Option<String> =
            sqlx::query_scalar("select plan from profiles where user_id = $1")
                .bind(user)
                .fetch_optional(pool)
                .await?;
        Ok(plan.as_deref().map_or(Self::Free, Self::parse))
    }

    /// Removes the paid fields from an analytics payload and marks it `locked`.
    pub fn restrict(self, mut analytics: Value) -> Value {
        if !self.is_paid() {
            if let Some(obj) = analytics.as_object_mut() {
                for key in PAID_FIELDS {
                    obj.remove(key);
                }
                obj.insert("locked".into(), Value::Bool(true));
            }
        }
        analytics
    }
}
