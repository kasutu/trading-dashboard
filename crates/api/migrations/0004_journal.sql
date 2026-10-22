-- The journal (docs/journal-data.md). Setups and mistake tags belong to the person; reviews to the
-- trading account. A trade review is keyed by ticket, so partial closes share one and re-importing
-- a CSV never removes it.
create table setups (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null check (char_length(name) between 1 and 40),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on setups (user_id);

create table mistake_tags (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null check (char_length(name) between 1 and 40),
  grp text not null check (grp in ('entry', 'exit', 'size', 'mindset')),
  preset boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on mistake_tags (user_id);

create table trade_reviews (
  account_id uuid not null references trading_accounts on delete cascade,
  ticket text not null,
  followed_plan boolean,
  setup_id uuid references setups on delete set null,
  grade text check (grade in ('A', 'B', 'C')),
  mood smallint check (mood between 1 and 5),
  no_mistakes boolean not null default false,
  initial_stop double precision check (initial_stop > 0),
  initial_target double precision check (initial_target > 0),
  note text check (char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (account_id, ticket)
);

create table trade_mistakes (
  account_id uuid not null,
  ticket text not null,
  mistake_id uuid not null references mistake_tags on delete cascade,
  primary key (account_id, ticket, mistake_id),
  foreign key (account_id, ticket) references trade_reviews on delete cascade
);

create table day_reviews (
  account_id uuid not null references trading_accounts on delete cascade,
  day date not null,
  pre_mood smallint check (pre_mood between 1 and 5),
  risks text[] not null default '{}',
  no_risks boolean not null default false,
  watch_setup_ids uuid[] not null default '{}',
  followed_plan boolean,
  note text check (char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (account_id, day)
);

-- Price candles from the prices service, one row per request window. Windows that end in the
-- future are not stored, so a cached window never misses bars.
create table candle_cache (
  symbol text not null,
  tf text not null,
  from_at timestamptz not null,
  to_at timestamptz not null,
  -- The candle length served. Older windows can come back longer than asked (see the prices service).
  served_tf text not null,
  candles jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (symbol, tf, from_at, to_at)
);
