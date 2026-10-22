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

-- Price candles from TradingView (src/tradingview.rs), kept so each bar is fetched once.
-- `symbol` is the broker's symbol as trades have it; `tf` the candle length ("1m" ... "1d").
create table candles (
  symbol text not null,
  tf text not null,
  time timestamptz not null,
  open double precision not null,
  high double precision not null,
  low double precision not null,
  close double precision not null,
  primary key (symbol, tf, time)
);

-- Time ranges already asked from TradingView, with or without bars, so a range is never asked twice.
create table candle_ranges (
  symbol text not null,
  tf text not null,
  from_at timestamptz not null,
  to_at timestamptz not null,
  primary key (symbol, tf, from_at, to_at)
);
