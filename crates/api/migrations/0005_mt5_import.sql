-- MetaTrader 5 report import.

-- The MetaTrader login a trading account holds. Set by the first MT5 report import; a report
-- for another login is refused.
alter table trading_accounts add column mt_login text;

-- Imported cash flows carry the broker's deal ticket, so a re-import skips them.
-- Hand-entered flows have none.
alter table cash_flows add column source_id text;
create unique index cash_flows_source_id on cash_flows (account_id, source_id)
  where source_id is not null;

-- Broker adjustments (for example a negative balance reset after a stop out, Exness "D-NULL").
-- Shown apart from deposits and withdrawals.
alter table cash_flows drop constraint cash_flows_kind_check;
alter table cash_flows add constraint cash_flows_kind_check
  check (kind in ('deposit', 'withdrawal', 'adjustment'));

-- The position's comment from the report (set by the trader or an EA, e.g. "range breakout").
-- Stored only; CSV imports leave it null.
alter table trades add column comment text;
