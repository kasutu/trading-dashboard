-- Risk limits of a trading account: {"kind": "percent" | "amount", "daily", "perTrade", "maxTrades"}.
-- Null: no limits set.
alter table trading_accounts add column risk jsonb;
