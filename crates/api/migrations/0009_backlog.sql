-- Settings that follow the user to every device: {"checkIn": bool, "minRr": number | null}.
-- Keys left out take their default (see routes/me.rs).
alter table profiles add column settings jsonb not null default '{}';

-- The daily reminder email. One row per user, created when they first save the settings.
-- `email` is the address to send to; it gets mail only once `verified_at` is set.
create table email_reminders (
  user_id text primary key,
  email text,
  verified_at timestamptz,
  -- The link sent to verify `email`. Cleared once used.
  verify_token text unique,
  verify_sent_at timestamptz,
  enabled boolean not null default false,
  -- "weekdays" (Mon to Fri), "daily", or "weekly" (Mondays).
  frequency text not null default 'weekdays' check (frequency in ('weekdays', 'daily', 'weekly')),
  -- "HH:MM" in `tz`.
  send_time text not null default '08:00',
  tz text not null default 'UTC',
  -- The local day (in `tz`) of the last email, so each user gets at most one a day.
  last_sent_day date,
  -- For the one-click unsubscribe link. Never changes.
  unsubscribe_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

-- Playbook: trades planned before they are taken.
create table planned_trades (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references trading_accounts on delete cascade,
  symbol text not null,
  side text not null check (side in ('buy', 'sell')),
  entry double precision not null,
  stop_loss double precision not null,
  take_profit double precision,
  lots double precision not null check (lots > 0),
  setup_id uuid references setups on delete set null,
  note text,
  status text not null default 'planned' check (status in ('planned', 'taken', 'skipped')),
  -- The trade it became, matched after an import or sync (see routes/playbook.rs).
  ticket text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on planned_trades (account_id, created_at);

-- The dollar value of one point per lot, entered by the user for a symbol. Overrides the
-- value worked out from the account's trades.
create table symbol_values (
  account_id uuid not null references trading_accounts on delete cascade,
  symbol text not null,
  point double precision not null check (point > 0),
  value_per_point double precision not null check (value_per_point > 0),
  primary key (account_id, symbol)
);

-- Exness Trader API connection of a trading account. The API key and the private key are
-- encrypted with CREDENTIALS_KEY (AES-256-GCM, see crypto.rs) and never leave the server.
create table exness_connections (
  account_id uuid primary key references trading_accounts on delete cascade,
  exness_account_id text not null,
  -- The account's own API host, from host discovery.
  host text not null,
  api_key bytea not null,
  private_key bytea not null,
  -- "ok", "failing" (last sync failed), or "paused" (3 failures in a row: reconnect).
  status text not null default 'ok' check (status in ('ok', 'failing', 'paused')),
  failures int not null default 0,
  last_error text,
  last_sync_at timestamptz,
  last_sync_trades int,
  last_sync_flows int,
  -- History is fetched up to here. The next sync starts a little before it.
  synced_until timestamptz,
  created_at timestamptz not null default now()
);

-- Raw deals and orders from the Exness history API. Positions are rebuilt from them on every
-- sync, because a position's opening deal can come in an earlier sync than its closing deal.
create table exness_history (
  account_id uuid not null references trading_accounts on delete cascade,
  kind text not null check (kind in ('deal', 'order')),
  id text not null,
  event_time timestamptz not null,
  data jsonb not null,
  primary key (account_id, kind, id)
);
