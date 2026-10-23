-- Internal transfers: money moved between the trader's own wallet or accounts at the broker
-- (Exness marks them with an `INT` part in the deal comment, e.g. `W-ALLINT-USD-INT-…`).
-- Still a deposit or withdrawal of this account, shown as a transfer.
alter table cash_flows add column internal boolean not null default false;

-- Flows already imported from MT5 reports keep the deal comment as their note.
update cash_flows set internal = true
  where source_id is not null and kind in ('deposit', 'withdrawal')
    and note ~* '^[DW]-(.+-)?INT(-|$)';
