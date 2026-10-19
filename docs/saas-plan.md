# Jurno SaaS plan

This document describes how to turn Jurno from a browser-only tool into a hosted product with accounts.
It is a plan, not a commitment. Decide the open questions at the end before you start.

## Current state

- Jurno is a static single-page app (Vite, React, TypeScript).
- The user loads one CSV file. Jurno parses it in the browser.
- The last file is kept in `localStorage`. Nothing goes to a server.
- All analysis is pure TypeScript in `src/lib/trades/` and `src/lib/insights.ts`. It has no UI or browser dependencies, so it can also run on a server.

## What a SaaS version needs

| Need | Why |
| --- | --- |
| Accounts and sign-in | Users must get their data back on any device. |
| Stored trades | History must grow with each import, not reset with each file. |
| Several trading accounts per user | Many traders have more than one broker account. |
| Duplicate-safe imports | Users re-export overlapping date ranges. The `ticket` column identifies a trade. |
| Billing | Paid plans. |
| Public share links (optional) | A link to a stats card, in addition to the PNG. |

## Recommended approach

Keep the Vite app and add a hosted backend-as-a-service, for example Supabase (Postgres, auth, row-level security, storage).
This avoids a custom server for the first version.

- **Auth:** email link and Google sign-in.
- **Database:** Postgres tables (below) with row-level security, so each user can read only their own rows.
- **Parsing:** keep `parseTradesCsv` in the browser. Send parsed rows, not the raw file.
- **Analysis:** keep it in the browser. Load the trades for the selected account and pass them to the existing functions. Move it to the server only if accounts grow past tens of thousands of trades.
- **Billing:** Stripe Checkout and the Stripe customer portal. A webhook updates the user's plan.

## Data model

```sql
-- One row per broker account
create table trading_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  broker text,
  currency text not null default 'USD',
  created_at timestamptz not null default now()
);

-- One row per closed trade. (account_id, ticket) prevents duplicates on re-import.
create table trades (
  account_id uuid not null references trading_accounts on delete cascade,
  ticket text not null,
  opened_at timestamptz not null,
  closed_at timestamptz not null,
  side text not null check (side in ('buy', 'sell')),
  lots numeric not null,
  symbol text not null,
  open_price numeric,
  close_price numeric,
  stop_loss numeric,
  take_profit numeric,
  commission numeric not null default 0,
  swap numeric not null default 0,
  profit numeric not null,
  close_reason text,
  primary key (account_id, ticket)
);

-- One row per uploaded file, for the import history
create table imports (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references trading_accounts on delete cascade,
  file_name text not null,
  added int not null,
  skipped int not null,
  created_at timestamptz not null default now()
);

create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  plan text not null default 'free',
  stripe_customer_id text,
  timezone text
);
```

Enable row-level security on every table. Allow a user to access only rows where `user_id = auth.uid()`, directly or through `trading_accounts`.

## Code changes

The current code already separates data, hooks and UI. Most changes are in the hooks.

| File | Change |
| --- | --- |
| `src/hooks/use-trade-file.ts` | Replace with `useTrades(accountId)`: fetch from the database. Keep `load(file)`: parse in the browser, then upsert rows and log an import. |
| `src/lib/trades/parse.ts` | No change. Add a `toRow(trade, accountId)` mapper next to the data client. |
| `src/lib/trades/*`, `src/lib/insights.ts` | No change. |
| `src/lib/storage.ts`, `use-theme.ts` | Keep for per-device preferences. |
| `src/components/layout/app-header.tsx` | Add an account switcher and a user menu. Replace "Replace file" with "Import trades". |
| `src/components/upload/welcome.tsx` | Becomes the signed-out landing page. **Change the copy "Nothing is uploaded"**, because it is no longer true. |
| New: `src/lib/api.ts` | The only module that talks to the backend. |
| New: sign-in page, account settings, billing page | |

## Phases

1. **Accounts and storage**
   1. Create the backend project and the tables above. Turn on row-level security.
   2. Add sign-in and sign-out.
   3. Replace `useTradeFile` with `useTrades`. Upsert on import and show "N added, M already stored".
   4. Add trading accounts and the account switcher.
   5. Offer to import the trades that are already in `localStorage` after the first sign-in.
2. **Billing**
   1. Define the plans and their limits.
   2. Add Stripe Checkout, the customer portal and a webhook that sets `profiles.plan`.
   3. Enforce the limits in the database or in a server function, not only in the UI.
3. **Product**
   1. Public share links for the stats card.
   2. More broker formats. Put one parser per broker behind `parseTradesCsv`.
   3. Email summaries, for example a weekly report.

## Before launch

- Privacy policy and terms. Trade history is financial data.
- Account deletion that removes all rows (the `on delete cascade` above does this).
- Data export (CSV) for each account.
- A rule against personal data in logs and error reports.
- Backups of the database.

## Open questions

1. Which backend: Supabase, Firebase, or a custom server?
2. Where to host the front end: Vercel, Netlify or Cloudflare Pages?
3. Which plans and prices? What does the free plan include (for example, one account and 90 days of history)?
4. Which brokers after Exness and MetaTrader 5?
5. Do users need a "local only" mode that never uploads trades?
