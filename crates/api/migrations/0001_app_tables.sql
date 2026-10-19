-- App tables. The auth service owns "user", "session", "account" and "verification".

create table profiles (
  user_id text primary key,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

create table trading_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  broker text,
  currency text not null default 'USD',
  created_at timestamptz not null default now()
);
create index on trading_accounts (user_id);

create table trades (
  account_id uuid not null references trading_accounts on delete cascade,
  ticket text not null,
  opened_at timestamptz not null,
  closed_at timestamptz not null,
  side text not null check (side in ('buy', 'sell')),
  lots double precision not null,
  symbol text not null,
  open_price double precision not null,
  close_price double precision not null,
  stop_loss double precision,
  take_profit double precision,
  commission double precision not null default 0,
  swap double precision not null default 0,
  profit double precision not null,
  close_reason text not null default '',
  primary key (account_id, ticket)
);

create table imports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references trading_accounts on delete cascade,
  file_name text not null,
  added int not null,
  duplicates int not null,
  skipped int not null,
  created_at timestamptz not null default now()
);

create table column_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  mapping jsonb not null,
  created_at timestamptz not null default now()
);
create index on column_mappings (user_id);
