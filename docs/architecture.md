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
| Plans | Coffee-priced. See [Plans](#plans). Billing is not built yet. |

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
4. Username and password only. No email in the UI. (The auth work documents how this is done with Better Auth.)

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
```

## HTTP API

All routes are under `/api`, take and return JSON (camelCase), and need a session unless marked public. Errors: `{ "error": "<plain message>" }` with status 400, 401, 403, 404 or 422.

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/health` (public) | | `{ "ok": true }` |
| `GET /api/me` | | `{ id, username, plan }`. Creates the `profiles` row on first call. |
| `GET /api/accounts` | | `Account[]` |
| `POST /api/accounts` | `{ name, broker?, currency? }` | `Account` |
| `PATCH /api/accounts/:id` | `{ name?, broker?, currency? }` | `Account` |
| `DELETE /api/accounts/:id` | | `204` |
| `GET /api/accounts/:id/imports` | | `Import[]`, newest first |
| `POST /api/accounts/:id/imports` | `{ fileName, csv, mapping: ColumnMapping }` | `Import`. Upserts trades on `(account_id, ticket)`. `duplicates` counts tickets already stored. `422` with the parse error message when parsing fails. Max body 20 MB. |
| `GET /api/presets` (public) | | `{ exness: ColumnMapping }` |
| `GET /api/mappings` | | `SavedMapping[]` |
| `POST /api/mappings` | `{ name, mapping }` | `SavedMapping` |
| `DELETE /api/mappings/:id` | | `204` |
| `GET /api/accounts/:id/analytics` | query: `range=7\|30\|90\|all`, `symbol`, `side=buy\|sell`, `tz` | `Analytics` (see `crates/engine/src/lib.rs`), or `{ "empty": true }` when no trades match |
| `GET /api/accounts/:id/trades` | query: the analytics filters, plus `from`, `to` (yyyy-mm-dd, inclusive, in `tz`), `page` (0-based), `pageSize` (default 25, max 500) | `{ rows: LocalTrade[], total }`, newest first |

Types:

```ts
Account      = { id, name, broker: string | null, currency, createdAt, trades: number }
Import       = { id, fileName, added, duplicates, skipped, createdAt }
SavedMapping = { id, name, mapping: ColumnMapping, createdAt }
```

Every route that takes `:id` checks that the account belongs to the session user (404 otherwise).

## Analytics split

- **Engine (Rust):** parsing, normalizing, grouping, simulations, the optimizer. All numbers.
- **Web (TypeScript):** wording and layout. `src/lib/insights.ts` turns the `Analytics` payload into notes. Formatting (money, 12-hour time) stays in the browser.

## Plans

Prices sit at the price of a coffee. Billing (payment provider) is not built yet, so every user is on `free` and no limit is enforced. The pricing page shows the plans with the paid buttons marked "Coming soon".

| Plan | Price | Includes |
| --- | --- | --- |
| Free | $0 | 1 trading account, all dashboards, notes, share card with "Made with Jurno" |
| Espresso | $3 / month | Everything in Free, plus the Plan tab (optimizer) and saved column mappings |
| Latte | $5 / month | Everything in Espresso, plus up to 5 trading accounts and the share card without the footer |

Yearly billing: 10 months' price for 12 months. The plan list lives in one file in the web app (`src/lib/plans.ts`) and in this table.
