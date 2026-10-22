# Jurno architecture

This document is the contract between the services. Change it together with the code it describes.

## Decisions

| Topic | Decision |
| --- | --- |
| Backend | Rust. `crates/engine` (pure analytics) and `crates/api` (HTTP, Postgres). |
| Auth | Better Auth (TypeScript) in `apps/auth`, username and password only. The Rust API reads the same session table. |
| Front end | `apps/web` (Vite, React). A thin client: it renders the analytics that the API returns. |
| Hosting | Railway. One service each for web, api and auth, plus Railway Postgres. |
| Brokers | Exness preset, plus a column mapper for any CSV. |
| Data | Trades are stored on the server. There is no local-only mode. |
| Plans | Free, Espresso ($9) and Latte ($15). See [Plans](#plans). Billing is not built yet. |

## Services

```
browser ──► web (Caddy: static files + reverse proxy)
              ├── /api/auth/*  ──► auth (Node, Better Auth)  ─┐
              └── /api/*       ──► api  (Rust, axum)          ├──► Postgres
                                                              ┘
```

- All traffic goes through the web service, so the browser sees one origin. No CORS. Cookies are first-party.
- Services talk over Railway private networking. Only web has a public domain.
- Local development: `docker compose up` starts Postgres, auth and api. `npm run dev` in `apps/web` starts Vite, which proxies `/api/auth` and `/api` the same way.

### Environment variables

| Service | Variable | Example |
| --- | --- | --- |
| auth | `DATABASE_URL` | `postgres://jurno:jurno@localhost:5432/jurno` |
| auth | `BETTER_AUTH_SECRET` | 32+ random bytes |
| auth | `BETTER_AUTH_URL` | `http://localhost:5173` (the public origin) |
| auth | `PORT` | `3001` |
| api | `DATABASE_URL` | same database |
| api | `PORT` | `8080` |
| web (Caddy) | `AUTH_UPSTREAM` | `auth.railway.internal:3001` |
| web (Caddy) | `API_UPSTREAM` | `api.railway.internal:8080` |

## Authentication

1. The web app calls Better Auth through `/api/auth/*` (sign up, sign in, sign out, get session) with the Better Auth client.
2. Better Auth sets the session cookie `better-auth.session_token` (in production with HTTPS: `__Secure-better-auth.session_token`). The value is `<token>.<signature>`.
3. The Rust API reads that cookie, takes the part before the first `.`, and looks it up:
   ```sql
   select "userId" from "session" where "token" = $1 and "expiresAt" > now()
   ```
   No row: respond `401`. The auth service owns the `user`, `session`, `account` and `verification` tables and their migrations. The API only reads `session` and `user`.
4. Username and password only. No email in the UI. Better Auth's `username` plugin stores the lower-case username in `"user"."username"` and the typed form in `"user"."displayUsername"`. Better Auth still needs an email, so the auth server fills in `<username>@users.jurno.invalid` at sign up. See `apps/auth/README.md` for the web client calls.

## Database

The auth service migrates its own tables. The API migrates the tables below with sqlx (`crates/api/migrations`). `user_id` is the Better Auth user id (text). There is no foreign key across the two sets of tables, so either service can migrate first.

```sql
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
  -- A partial close is its own row with the same ticket, so the ticket alone is not unique.
  primary key (account_id, ticket, closed_at, lots, close_price)
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

-- Deposits and withdrawals, entered by hand (the trade CSV has none).
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
```

## HTTP API

All routes are under `/api`, take and return JSON (camelCase), and need a session unless marked public. Errors: `{ "error": "<plain message>" }` with status 400, 401, 403, 404 or 422.

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/health` (public) | | `{ "ok": true }` |
| `GET /api/me` | | `{ id, username, plan }`. `username` is the form the user typed (`displayUsername`). Creates the `profiles` row on first call. |
| `GET /api/accounts` | | `Account[]` |
| `POST /api/accounts` | `{ name, broker?, currency? }` | `Account` |
| `PATCH /api/accounts/:id` | `{ name?, broker?, currency? }` | `Account` |
| `DELETE /api/accounts/:id` | | `204` |
| `GET /api/accounts/:id/imports` | | `Import[]`, newest first |
| `POST /api/accounts/:id/imports` | `{ fileName, csv, mapping: ColumnMapping }` | `Import`. Upserts trades on `(account_id, ticket, closed_at, lots, close_price)`, so partial closes (same ticket) are kept. `duplicates` counts rows already stored. `422` with the parse error message when parsing fails. Max body 20 MB. |
| `GET /api/accounts/:id/cash-flows` | query: `tz` (default `UTC`) | `{ rows: LocalCashFlow[], summary: CashSummary, daily: CashDay[] }`. Rows newest first. `summary` and `daily` come from `engine::cash_report`; days are in `tz`. Not affected by the dashboard filters. |
| `POST /api/accounts/:id/cash-flows` | `{ occurredAt, kind: "deposit" \| "withdrawal", amount, note? }` | `CashFlow`. `400` when `kind` is not deposit or withdrawal, `amount` is not more than 0, or `note` is over 200 characters. An empty note is stored as `null`. |
| `DELETE /api/accounts/:id/cash-flows/:flowId` | | `204`. `404` when the entry is not in this account. |
| `GET /api/presets` (public) | | `{ exness: ColumnMapping }` |
| `GET /api/mappings` | | `SavedMapping[]` |
| `POST /api/mappings` | `{ name, mapping }` | `SavedMapping` |
| `DELETE /api/mappings/:id` | | `204` |
| `GET /api/accounts/:id/analytics` | query: `range=7\|30\|90\|all`, `symbol`, `side=buy\|sell`, `tz` | `Analytics` (see `crates/engine/src/lib.rs`), or `{ "empty": true }` when no trades match. On Free, the paid fields are left out and `locked: true` is added (see [Plans](#plans)). |
| `GET /api/accounts/:id/trades` | query: the analytics filters, plus `from`, `to` (yyyy-mm-dd, inclusive, in `tz`), `page` (0-based), `pageSize` (default 25, max 500) | `{ rows: LocalTrade[], total }`, newest first |

Types:

```ts
Account      = { id, name, broker: string | null, currency, createdAt, trades: number }
Import       = { id, fileName, added, duplicates, skipped, createdAt }
SavedMapping = { id, name, mapping: ColumnMapping, createdAt }
CashFlow     = { id, occurredAt, kind: "deposit" | "withdrawal", amount, note: string | null, createdAt }  // amount > 0
LocalCashFlow = CashFlow & { day }  // yyyy-mm-dd of occurredAt in tz
CashSummary  = { deposits: { count, total }, withdrawals: { count, total }, net }  // net = deposits - withdrawals
CashDay      = { day, deposits, withdrawals, net, cumulative }  // one per day with a flow, oldest first; cumulative = net deposited so far
```

Deposits and withdrawals are on every plan. They are not trades: they never change the P&L numbers. The web app shows them in the Funding tab and as markers on the equity curve.

Every route that takes `:id` checks that the account belongs to the session user (404 otherwise).

## Trade chart

**Planned. The prototype uses generated candles** (`apps/web/src/mock/prices.ts`, `VITE_MOCK=1`). No Rust route or table exists yet.

Each trade can open a candlestick chart of its symbol with the entry and exit marked, lines at the entry, exit, stop loss and take profit, and the holding time shaded. The web app draws it with TradingView's open-source [Lightweight Charts](https://github.com/tradingview/lightweight-charts) (Apache 2.0, pinned in `apps/web/package.json`, loaded only when a chart opens). The library draws; it brings no market data, so the candles come from our API.

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/accounts/:id/candles` | query: `symbol`, `tf=1m\|5m\|15m\|1h\|4h\|1d`, `from`, `to` (ISO 8601, UTC) | `{ symbol, tf, candles: Candle[] }`, oldest first. `400` for a missing symbol, an unknown `tf` or `from` not before `to`. `422` when the window is more than 2000 candles. `404` when there are no prices for the symbol. |

```ts
Candle = { time, open, high, low, close }  // time: the bar's start, unix seconds UTC
```

- The web app picks the timeframe from the hold time (`apps/web/src/lib/timeframes.ts`: the shortest that fits the hold in 120 candles) and asks for a window of 30% of the hold time on each side, at least 20 candles. The user can switch the timeframe.
- The route is per account so it can check ownership and, later, use the broker's own symbol names and quotes.
- The mock gives each trade believable prices (a seeded walk per symbol, the close moved by the trade's profit) and builds candles as a Brownian bridge through every entry and exit, so the chart passes through the real fills.

Where real candles could come from (not decided):

- A market-data provider with historical intraday OHLC for FX, metals and crypto (for example Twelve Data, Polygon, Finnhub, Tiingo or OANDA's API). Check the license allows showing the data to users, and the cost per symbol and history depth.
- Crypto exchange public APIs (for example Binance or Coinbase) for crypto symbols. Free, but prices differ a little from a CFD broker's.
- The broker itself, for example MetaTrader 5 history exported by the user, or the broker's API. Matches the fills best, but needs work per broker.
- TradingView does not sell or provide market data through Lightweight Charts or any public API; it is only the drawing library.

Whichever source: cache candles in Postgres by `(symbol, tf, time)` so each window is fetched once, and expect small gaps against the broker's fills (different liquidity providers, spreads, and bid versus ask).

## Analytics split

- **Engine (Rust):** parsing, normalizing, grouping, simulations, the optimizer, the deposit and withdrawal totals (`cash_report`). All numbers.
- Days, weeks and months use the trade's opening time in the filter timezone (`tz`). `byWeek` is keyed by the Monday (`yyyy-mm-dd`), `byMonth` by `yyyy-mm`, both sorted. `bestLots` picks, per symbol, the lot size with the highest net (only if above 0) and the one with the lowest (only if below 0), among sizes with at least 5 trades (`MIN_LOT_TRADES` in `stats.rs`).
- **Web (TypeScript):** wording and layout. `src/lib/insights.ts` turns the `Analytics` payload into notes. Formatting (money, 12-hour time) stays in the browser.

## Plans

Billing (a payment provider) is not built yet. Every new user is on `free`. To put a user on a paid plan for testing, set `profiles.plan` to `espresso` or `latte` in the database.

| Plan | Price | Includes |
| --- | --- | --- |
| Free | $0 | 1 trading account. Summary and equity curve, trading calendar, weekly and monthly P&L, results by symbol, side, position size and close reason, best lot size per symbol, trade list, deposits and withdrawals. Share card with "Made with Jurno". |
| Espresso | $9 / month | Everything in Free. Notes, Plan, Timing, Frequency, and the Risk simulations (daily loss limit, trades after a loss). Saved column mappings. |
| Latte | $15 / month | Everything in Espresso. Up to 5 trading accounts. Share card without the footer. |

Yearly billing: 10 months' price for 12 months.

There is also an `owner` plan for the creator: everything in Latte, with no account limit. It is not sold and not on the pricing page. Set it with `just owner <username>`, or in production with `update profiles set plan = 'owner' where user_id = '<user id>'`.

The API enforces the limits (`crates/api/src/plan.rs`):

- Analytics on Free: the server removes `byHour`, `byWeekday`, `heatmap`, `byDuration`, `nthTrade`, `dayBuckets`, `capSim`, `lossLimitSim`, `afterLoss` and `optimization`, and adds `locked: true`. The web app shows a locked panel for those views. Everything else stays, including `byWeek`, `byMonth` and `bestLots`.
- `POST /api/accounts` returns 403 when the user has reached the plan's account limit.
- `POST /api/mappings` returns 403 on Free.

The plan list for the web app is in `apps/web/src/lib/plans.ts`. Keep it, `plan.rs` and this table in step.
