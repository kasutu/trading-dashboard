# Jurno architecture

This document is the contract between the services. Change it together with the code it describes.

## Decisions

| Topic | Decision |
| --- | --- |
| Backend | Rust. `crates/engine` (pure analytics) and `crates/api` (HTTP, Postgres). |
| Auth | Better Auth (TypeScript) in `apps/auth`, username and password only. The Rust API reads the same session table. |
| Front end | `apps/web` (Vite, React). A thin client: it renders the analytics that the API returns. |
| Hosting | Railway. One service each for web, api and auth, plus Railway Postgres. |
| Market data | Chart candles from TradingView's chart websocket, without an account (`crates/api/src/tradingview.rs`, the messages of the unofficial [TradingView-API](https://github.com/Mathieu2301/TradingView-API)). Free, and no extra service. Every bar is kept in Postgres. |
| Brokers | Exness preset, plus a column mapper for any CSV. MetaTrader 5 trade history reports (HTML) with trades, deposits and withdrawals; see [MT5 report import](#mt5-report-import). |
| Data | Trades are stored on the server. There is no local-only mode. |
| Plans | Free, Espresso ($9) and Latte ($15). See [Plans](#plans). Billing is not built yet. |

## Services

```
browser ──► web (Caddy: static files + reverse proxy)
              ├── /api/auth/*  ──► auth (Node, Better Auth)  ─┐
              └── /api/*       ──► api  (Rust, axum)          ├──► Postgres
                                        │                     ┘
                                        └── candles not stored yet ──► TradingView (websocket)
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
| api | `CREDENTIALS_KEY` | 32 bytes, base64 (`openssl rand -base64 32`). Encrypts broker keys. Without it, Exness cannot be connected. Do not change it: stored keys need the same one. |
| api | `RESEND_API_KEY` | Sends the reminder email through Resend. Without it, emails go to the api log. |
| api | `EMAIL_FROM` | `Jurno <reminders@jurno.app>` |
| api | `PUBLIC_URL` | Origin for links in emails. Defaults to `BETTER_AUTH_URL`. |
| api | `EXNESS_SYNC` | `off` hides the Exness connection and stops the sync job. On by default. |
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
  mt_login text,             -- MetaTrader login, set by the first MT5 report import
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
  comment text,              -- the position comment from an MT5 report; null from a CSV
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

-- Deposits, withdrawals and broker adjustments, entered by hand or imported from an MT5 report.
create table cash_flows (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references trading_accounts on delete cascade,
  occurred_at timestamptz not null,
  kind text not null check (kind in ('deposit', 'withdrawal', 'adjustment')),
  amount double precision not null check (amount > 0),
  note text,
  source_id text,            -- the MT5 deal ticket when imported; null when entered by hand
  created_at timestamptz not null default now()
);
create index on cash_flows (account_id);
create unique index cash_flows_source_id on cash_flows (account_id, source_id) where source_id is not null;

-- Every bar from TradingView, and every range already asked for (with or without bars).
create table candles (
  symbol text not null,      -- the broker's symbol, as trades have it
  tf text not null,          -- 1m, 5m, 15m, 1h, 4h, 1d
  time timestamptz not null, -- the bar's start
  open double precision not null, high double precision not null,
  low double precision not null, close double precision not null,
  primary key (symbol, tf, time)
);
create table candle_ranges (
  symbol text not null,
  tf text not null,
  from_at timestamptz not null,
  to_at timestamptz not null,
  primary key (symbol, tf, from_at, to_at)
);
```

The journal tables (`setups`, `mistake_tags`, `trade_reviews`, `trade_mistakes`, `day_reviews`) are in
[journal-data.md](journal-data.md#data-model). Migration: `crates/api/migrations/0004_journal.sql`.
`mt_login`, `trades.comment`, `cash_flows.source_id` and the `adjustment` kind come from `0005_mt5_import.sql`.

## HTTP API

All routes are under `/api`, take and return JSON (camelCase), and need a session unless marked public. Errors: `{ "error": "<plain message>" }` with status 400, 401, 403, 404, 409 or 422.

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/health` (public) | | `{ "ok": true }` |
| `GET /api/me` | | `{ id, username, plan, settings: { checkIn, minRr }, features: { exness, email } }`. `username` is the form the user typed (`displayUsername`). Creates the `profiles` row on first call. |
| `PATCH /api/me/settings` | `{ checkIn?, minRr? }` | The settings (`profiles.settings`). `minRr: null` clears it. `400` for another key or value. |
| `GET /api/accounts/:id/today` | query: `tz` | `TodayPlan` (`crates/engine/src/today.rs`), or `{ "empty": true }`. The Today card and the reminder email both use it. On Free the paid parts are left out (`locked: true`). |
| `GET /api/accounts` | | `Account[]` |
| `POST /api/accounts` | `{ name, broker?, currency? }` | `Account` |
| `PATCH /api/accounts/:id` | `{ name?, broker?, currency? }` | `Account` |
| `DELETE /api/accounts/:id` | | `204` |
| `GET /api/accounts/:id/imports` | | `Import[]`, newest first |
| `POST /api/accounts/:id/imports` | MT5: `{ fileName, format: "mt5", report, serverTz?, dryRun? }` | `Mt5ImportResult`. See [MT5 report import](#mt5-report-import). `400` for another `format`, an unknown `serverTz` or a bad body; `409` when the account holds another MetaTrader login; `422` when the text is not an MT5 report or has nothing to import. |
| `POST /api/accounts/:id/imports` | CSV: `{ fileName, csv, mapping: ColumnMapping }` (`format` absent or `"csv"`) | `Import`. Upserts trades on `(account_id, ticket, closed_at, lots, close_price)`, so partial closes (same ticket) are kept. `duplicates` counts rows already stored. `422` with the parse error message when parsing fails. Max body 20 MB. |
| `GET /api/accounts/:id/cash-flows` | query: `tz` (default `UTC`) | `{ rows: LocalCashFlow[], summary: CashSummary, daily: CashDay[] }`. Rows newest first. `summary` and `daily` come from `engine::cash_report`; days are in `tz`. Not affected by the dashboard filters. |
| `POST /api/accounts/:id/cash-flows` | `{ occurredAt, kind: "deposit" \| "withdrawal" \| "adjustment", amount, note? }` | `CashFlow`. `400` when `kind` is not deposit, withdrawal or adjustment, `amount` is not more than 0, or `note` is over 200 characters. An empty note is stored as `null`. |
| `DELETE /api/accounts/:id/cash-flows/:flowId` | | `204`. `404` when the entry is not in this account. |
| `POST /api/accounts/:id/cash-flows/bulk` | `{ ids: uuid[], action: "delete" \| "markInternal" \| "markExternal" }` | `{ affected }`. Entries of other accounts are left alone; marking skips adjustments. `400` for no ids, more than 1000, or another action. |
| `GET /api/presets` (public) | | `{ exness: ColumnMapping }` |
| `GET /api/mappings` | | `SavedMapping[]` |
| `POST /api/mappings` | `{ name, mapping }` | `SavedMapping` |
| `DELETE /api/mappings/:id` | | `204` |
| `GET /api/accounts/:id/analytics` | query: `range=7\|30\|90\|all`, `symbol`, `side=buy\|sell`, `tz` | `Analytics` (see `crates/engine/src/lib.rs`), or `{ "empty": true }` when no trades match. On Free, the paid fields are left out and `locked: true` is added (see [Plans](#plans)). |
| `GET /api/accounts/:id/trades` | query: the analytics filters, plus `from`, `to` (yyyy-mm-dd, inclusive, in `tz`), `page` (0-based), `pageSize` (default 25, max 500) | `{ rows: LocalTrade[], total }`, newest first |

Types:

```ts
Account      = { id, name, broker: string | null, currency, mtLogin: string | null, createdAt, trades: number }
Import       = { id, fileName, added, duplicates, skipped, createdAt }
SavedMapping = { id, name, mapping: ColumnMapping, createdAt }
CashFlow     = { id, occurredAt, kind: "deposit" | "withdrawal" | "adjustment", amount, note: string | null,
                 sourceId: string | null, createdAt }  // amount > 0; sourceId = MT5 deal ticket, null when entered by hand
LocalCashFlow = CashFlow & { day }  // yyyy-mm-dd of occurredAt in tz
CashSummary  = { deposits: { count, total }, withdrawals: { count, total }, adjustments: { count, total }, net }
               // net = deposits - withdrawals; adjustments are kept apart
CashDay      = { day, deposits, withdrawals, adjustments, net, cumulative }  // one per day with a flow, oldest first;
               // cumulative = net deposited so far (adjustments left out)
Mt5ImportResult = {
  dryRun, import: Import | null,          // null on a dry run
  account: { login, server, kind, currency, company },  // kind: "real" | "demo" | "contest"
  from, to,                               // first and last time in the report (UTC), or null
  positions, totalNet: number | null,     // positions in the report; Results' Total Net Profit
  trades: { added, duplicates },
  cashFlows: { added, duplicates, summary: CashSummary,   // summary: every balance deal in the report
               possibleManualDuplicates: { id, occurredAt, kind, amount, note }[] },
  skippedDeals: { [type]: count },        // e.g. { credit: 1 }: deals not imported
  skippedRows,                            // position rows without valid times
}
```

Deposits, withdrawals and adjustments are on every plan. They are not trades: they never change the P&L numbers. The web app shows them in the Funding tab; the equity curve leaves them off. An adjustment is money the broker put in that the trader did not send, such as Exness's negative balance reset (`D-NULL`); it is not counted in net deposited.

MT5 balance deals are read from the deal comment: `D-` is money in (a deposit) and `W-` money out (a withdrawal). A comment with an `INT` part (`W-ALLINT-USD-INT-…`) is an internal transfer, money moved between the trader's own Exness wallet and accounts; without it the money came from or went outside (`CC` credit card, `PHPAYMAY` PayMaya, `PHGCASHG` GCash and so on). Internal transfers stay inside the deposit and withdrawal totals, since they did move this account's balance, and are flagged `internal` so the Funding tab can show them as "Transfer in / out" and total them apart ("Of which internal").

Every route that takes `:id` checks that the account belongs to the session user (404 otherwise).

## MT5 report import

The person saves the report in MetaTrader 5 desktop: History tab, right-click, Report, HTML. MT4 reports are not supported yet.

- **File.** UTF-16 LE with a BOM (as MT5 saves it) or UTF-8. The web app decodes it (`src/lib/mt5.ts`), recognises a report ("Trade History Report", or Positions and Deals sections) and sends the text in JSON, so a 2 MB UTF-16 file is about 1 MB of the 20 MB body limit. Parsing is in the engine (`crates/engine/src/mt5.rs`, `parse_mt5_report`); column headers are matched by their English names.
- **Times** are broker server time, read in `serverTz` (default `UTC`). Exness servers run on UTC; many other brokers run on UTC+2/+3. The web app presets UTC when the server or company names Exness, and otherwise asks.
- **Trades.** One per row of the Positions table (a partly closed position is one row with totals): ticket = position id, open and close time and price, side, lots, S/L and T/P (empty = null), commission, swap, profit. The close reason comes from the deal(s) that closed it, matched on symbol and close time, and on the close price when several deals share that time; the last deal's comment decides: `[sl` → `sl`, `[tp` → `tp`, `[so` → `so` (margin stop out), anything else `user`. The position comment (a hidden column) is stored in `trades.comment`.
- **Cash flows.** One per `balance` deal, with the deal ticket as `source_id` and the comment as the note:
  - money in with no transfer reference (comment empty or `…-NULL`, e.g. Exness `D-NULL`, a negative balance reset after a stop out) → `adjustment`, note "Negative balance reset (broker) · D-NULL";
  - money out (`W-…` or anything else) → `withdrawal`;
  - other money in (`D-…` or anything else) → `deposit`.

  Other deal types (`credit`, `bonus`, `correction`, `charge`, `commission`, `interest`, `dividend`, …) are not imported; they are counted in `skippedDeals`.
- **Account rule.** The first MT5 import sets `trading_accounts.mt_login` to the report's login, and fills `broker` (from the company) when it is empty and `currency` when the account has no trades or cash flows yet. A report for another login is refused with `409`: "This report is for MetaTrader account X. This Jurno account holds Y."
- **Duplicates.** A position whose ticket is stored in any form (for example as CSV partial-close rows) is skipped and counted in `trades.duplicates`. Cash flows whose `source_id` is stored are skipped. Hand-entered flows (no `source_id`) of the same kind and amount within a day of a newly imported one are returned in `possibleManualDuplicates`; nothing is deleted.
- **Import row.** `added` and `duplicates` count trades; `skipped` = unreadable position rows + deals not imported.
- **Dry run.** `dryRun: true` runs the same checks (409 included) and counts without writing. The web app uses it for the preview.
- Plans: same as the CSV import (every plan).

## Journal

Built: `crates/api/src/routes/journal.rs` (routes and validation) and `crates/engine/src/journal.rs` (positions, R, summary).

The questions, the review flow, the tables (`setups`, `mistake_tags`, `trade_reviews`, `trade_mistakes`, `day_reviews`), the
types and the rules (when to ask for the starting stop, result in R, validation, the summary) are in
[journal-data.md](journal-data.md). Routes:

| Method and path | Response |
| --- | --- |
| `GET /api/journal/tags` | The person's setups and mistake tags (presets created on first call) |
| `POST /api/journal/setups`, `PATCH /api/journal/setups/:setupId` | `Setup` |
| `POST /api/journal/mistakes`, `PATCH /api/journal/mistakes/:mistakeId` | `MistakeTag` |
| `GET /api/accounts/:id/journal` | `Journal`: positions with `askStop` and `r`, trade and day reviews, day stats. Every plan. Not affected by the dashboard filters. |
| `PATCH /api/accounts/:id/journal/trades/:ticket` | `TradeReview`, or `204` when every answer is blank |
| `PATCH /api/accounts/:id/journal/days/:day` | `DayReview`, or `204` |
| `GET /api/accounts/:id/journal/summary` | `JournalSummary`; `{ locked: true }` on Free |

The before-trading check-in setting is saved in `profiles.settings` (`PATCH /api/me/settings`). Setups and mistake tags can be renamed and archived from the chips themselves (the pencil chip), as well as in Settings.

## Trade chart

Each trade can open a candlestick chart of its symbol. Entry (A) and exit (B) sit at their exact time and price, MT5 style, joined by a dashed line; the stop loss and take profit are lines you can drag (saved as the review's `initialStop` and `initialTarget`); the holding time is shaded. The web app draws it with TradingView's open-source [Lightweight Charts](https://github.com/tradingview/lightweight-charts) (Apache 2.0, pinned in `apps/web/package.json`, loaded only when a chart opens). The library draws; it brings no market data, so the candles come from our API.

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/accounts/:id/candles` | query: `symbol`, `tf=1m\|5m\|15m\|1h\|4h\|1d`, `from`, `to` (ISO 8601) | `{ symbol, tf, candles: Candle[] }`, oldest first. `tf` is the length served, which can be longer than asked. `400` for a missing symbol, an unknown `tf` or `from` not before `to`. `422` when the window is more than 2000 candles. `404` when TradingView does not know the symbol or has no bars in the window. |

```ts
Candle = { time, open, high, low, close }  // time: the bar's start, unix seconds UTC
```

- The web app picks the timeframe from the hold time (`apps/web/src/lib/timeframes.ts`: the shortest that fits the hold in 120 candles) and asks for a window of 30% of the hold time on each side, at least 20 candles. The user can switch the timeframe.
- The API keeps every bar in `candles` and every range it asked for in `candle_ranges`, also when the range had no bars. A window that the stored ranges cover is answered from Postgres; only a window with a gap goes to TradingView, so each range is asked once. Ranges in the future are not recorded.
- `src/tradingview.rs` opens TradingView's chart websocket without an account: `set_auth_token`, `chart_create_session`, `resolve_symbol`, `create_series` with `bar_count` up to `to`, then reads `timescale_update` until `series_completed`. It maps the broker symbol to TradingView symbols (`XAUUSDm` → `OANDA:XAUUSD`, then `FX:`, `FOREXCOM:`; coins → `BITSTAMP:`, `COINBASE:`, `BINANCE:`) and remembers the one that worked.
- Without an account, TradingView gives about 7,000 one-minute bars (a few days back), so for older trades the API steps up to the next length that has bars (1m → 5m → 15m → 1h → 4h → 1d). The chart says when it shows longer candles than asked, and when the fills are more than 3% outside the candles (likely a different instrument).
- Yahoo Finance and Dukascopy were tried as free sources for forex and gold; both refused server requests (429, 503).
- The websocket protocol is not a public TradingView API; TradingView-API is an independent, unofficial project. It can break when TradingView changes its site, and TradingView's terms and market-data licenses apply to how the data is shown. Check them before charging for the chart.

## Today card and reminder email

`engine::today` (`crates/engine/src/today.rs`) works out the Today card: the kind of day (`verdict`), trades left, the loss limit and risk per trade (`limits`, the stricter of the account's own and the plan's), today's rules and the questions before each trade. The wording (money, 12-hour times) is built there, so the card and the email say the same thing. Inputs: analytics of all the account's trades in `tz`, the balance (net deposited + adjustments + trading net, null without cash flows) and the account's `risk`.

The reminder email (`crates/api/src/reminders.rs`, table `email_reminders`):

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/email` | | `{ email, verified, enabled, frequency, time, tz, canSend }` |
| `PATCH /api/email` | `{ email?, enabled?, frequency?: "weekdays" \| "daily" \| "weekly", time?: "HH:MM", tz? }` | Same. A new address is unverified and gets a link. `400` for a bad value or a `.invalid` address. |
| `POST /api/email/verify` | | Sends the link again. `409` within a minute of the last one. |
| `POST /api/email/test` | | Sends today's email now. `400` when the address is not verified. |
| `GET /api/email/verify?token=` (public) | | HTML page. Links work once, for 7 days. |
| `GET\|POST /api/email/unsubscribe?token=` (public) | | HTML page; turns the email off. Every email has the link and `List-Unsubscribe` / `List-Unsubscribe-Post`. |

- Accounts have no real email (`<username>@users.jurno.invalid`), so the address is entered and verified here, in the API, not in Better Auth.
- A job in the api process runs every 15 minutes: for each enabled, verified user whose send time has passed in their `tz` today, on a sending day (weekdays Mon to Fri, daily, weekly on Mondays), it claims the day (`last_sent_day`) and sends one email with a section per trading account with trades. Weekly emails add the plan's best and skipped weekdays. A failed send gives the day back, so the next run tries again.
- On Free the email has what the Free card has.

## Playbook

Plan a trade with numbers only (`crates/engine/src/playbook.rs`, `crates/api/src/routes/playbook.rs`, table `planned_trades`).

- A point is the symbol's smallest price step (the most decimals in its trade prices). The value per point (dollars per point for 1 lot) is the median of |profit| ÷ (points moved × lots) over the account's trades, or the user's own value (`symbol_values`).
- Risk, reward, R:R, risk % of balance and SL/TP distance in points. Size by lots, a dollar risk or a % of the balance (lots rounded down to 0.01).
- Checks against today's plan: rest day, no trades left, risk above the room left before the loss limit or above the per-trade risk, a skipped hour, R:R below the user's `minRr`.
- After each import or sync, a planned trade is matched to the trade it became: same symbol and side, opened from 1 hour before the plan to 24 hours after, the open price nearest the entry. It turns `taken`, and the trade's review gets the plan's setup, starting stop and target when empty. The result shows the entry slippage in points, a moved SL or TP, changed lots and the result in R.

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /api/accounts/:id/playbook/calc` | `{ symbol, side, entry, stopLoss, takeProfit?, size: { by: "lots" \| "risk" \| "percent", value }, tz? }` | `{ math, value, checks, balance }`. Every plan. |
| `GET /api/accounts/:id/playbook` | query: `tz` | `{ plans, symbols, balance, minRr, locked }`. `plans` is empty on Free. |
| `POST /api/accounts/:id/playbook` | calc body plus `setupId?`, `note?` | `201` with the plan. `400` when the numbers do not work. `403` on Free. |
| `PATCH /api/accounts/:id/playbook/:plan` | `{ status?, note?, setupId? }` | The plan. `planned` or `skipped` clears the matched trade. `403` on Free. |
| `DELETE /api/accounts/:id/playbook/:plan` | | `204` |
| `PUT`, `DELETE /api/accounts/:id/playbook/symbols/:symbol` | `{ point, valuePerPoint }` | The user's value per point, or back to the one from trades. |

## Exness sync

Trades, deposits and withdrawals come from the Exness Trader API (`crates/exness`, a copy of the hermes `exness_rs` SDK; `crates/api/src/exness_sync.rs`).

- **Keys.** The user enters the account number, the API key and the Ed25519 private key (PEM or 128 hex characters) from Exness Key Management. The API builds a signer (a bad key is `400`), finds the account's host with host discovery (or uses the one given), and reads the account details. Only then are both keys stored, each encrypted with AES-256-GCM under `CREDENTIALS_KEY` with the account id as associated data (`crypto.rs`). They are never returned or logged. Disconnecting deletes them and the stored history; trades stay.
- **Account rule.** Like the MT5 import: the account number becomes `mt_login`; an account holding another login is `409`.
- **Sync.** A job every 10 minutes, plus "Sync now". It fetches deals and orders from 1 hour before the last synced time (the first time: as far back as `limits` allows), in windows of the allowed range, page by page. Raw items go to `exness_history`; positions are rebuilt from all of them (`engine::deals`), so a position opened in an earlier sync still closes. A trade is one fully closed position (ticket = position id, the same as the MT5 report); close reason from the closing order (`sl`, `tp`, `so`), SL/TP from the position's last order with them, swap from its `swap_fee` deals. `balance` deals are deposits or withdrawals, `null_compensation` is an adjustment. The API sends no deal comment, so internal transfers are not flagged. Stored tickets and deals are skipped, as in the MT5 import. Each sync that adds something writes an `imports` row named "Exness sync".
- **Status.** Last sync time, trades and cash flows added, the last error. After 3 failures in a row the status is `paused` until the user connects again.
- **Plans.** Connecting and syncing are on paid plans; file import stays free. `EXNESS_SYNC=off` turns it all off.

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/accounts/:id/exness` | | `{ enabled, canConnect, locked, connected, exnessAccountId, host, status, failures, lastError, lastSyncAt, lastSyncTrades, lastSyncFlows, syncedUntil, connectedAt }` |
| `PUT /api/accounts/:id/exness` | `{ accountId, apiKey, privateKey, host? }` | The status; the first sync starts in the background. `403` on Free or with the flag off, `409` for another login, `422` when Exness refuses or `CREDENTIALS_KEY` is not set. |
| `DELETE /api/accounts/:id/exness` | | `204` |
| `POST /api/accounts/:id/exness/sync` | | The status after the sync. `404` when not connected, `409` when paused or already syncing. |

## Analytics split

- **Engine (Rust):** parsing (CSV and MT5 reports), normalizing, grouping, simulations, the optimizer, the deposit and withdrawal totals (`cash_report`). All numbers.
- Days, weeks and months use the trade's opening time in the filter timezone (`tz`). `byWeek` is keyed by the Monday (`yyyy-mm-dd`), `byMonth` by `yyyy-mm`, both sorted. `bestLots` picks, per symbol, the lot size with the highest net (only if above 0) and the one with the lowest (only if below 0), among sizes with at least 5 trades (`MIN_LOT_TRADES` in `stats.rs`).
- **Web (TypeScript):** wording and layout. `src/lib/insights.ts` turns the `Analytics` payload into notes. Formatting (money, 12-hour time) stays in the browser.

## Plans

Billing (a payment provider) is not built yet. Every new user is on `free`. To put a user on a paid plan for testing, set `profiles.plan` to `espresso` or `latte` in the database.

| Plan | Price | Includes |
| --- | --- | --- |
| Free | $0 | 1 trading account. The Today card and its email, the playbook calculator. Summary and equity curve, trading calendar, weekly and monthly P&L, results by symbol, side, position size and close reason, best lot size per symbol, trade list, deposits and withdrawals, the journal (trade and day reviews, setups and mistake tags). Share images of the stats, the calendar month and single trades, with the site address, a QR code to it and a "Track your trades free" line. |
| Espresso | $9 / month | Everything in Free. Saved playbook plans compared with the trades, Exness sync. Notes (the automatic insights and what the journal says: P&L by setup, grade, mistake, plan and mood), Plan, Timing, Frequency, and the Risk simulations (daily loss limit, trades after a loss). Saved column mappings. |
| Latte | $15 / month | Everything in Espresso. Up to 5 trading accounts. Share images without the "Track your trades free" line (the address and QR code stay). |

Yearly billing: 10 months' price for 12 months.

There is also an `owner` plan for the creator: everything in Latte, with no account limit. It is not sold and not on the pricing page. Set it with `just owner <username>`, or in production with `update profiles set plan = 'owner' where user_id = '<user id>'`.

The API enforces the limits (`crates/api/src/plan.rs`):

- Analytics on Free: the server removes `byHour`, `byWeekday`, `heatmap`, `byDuration`, `nthTrade`, `dayBuckets`, `capSim`, `lossLimitSim`, `afterLoss`, `overtrading` and `optimization`, and adds `locked: true`. The web app shows a locked panel for those views. Everything else stays, including `byWeek`, `byMonth` and `bestLots`.
- `POST /api/accounts` returns 403 when the user has reached the plan's account limit.
- `POST /api/mappings` returns 403 on Free.
- Saving playbook plans and connecting or syncing Exness return 403 on Free.
- `GET /api/accounts/:id/journal/summary` returns `{ "locked": true }` on Free (see [Journal](#journal)). The journal itself is on every plan.

The plan list for the web app is in `apps/web/src/lib/plans.ts`. Keep it, `plan.rs` and this table in step.
