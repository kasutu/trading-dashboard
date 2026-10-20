-- Deposits and withdrawals. The trade CSV has none, so the user enters them by hand.
-- `amount` is always positive; `kind` gives the direction.
create table cash_flows (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references trading_accounts on delete cascade,
  occurred_at timestamptz not null,
  kind text not null check (kind in ('deposit', 'withdrawal')),
  amount double precision not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);
create index on cash_flows (account_id);
