# Jurno

Jurno reads a broker trade history (CSV) and shows where you make and lose money.
The file stays in the browser. Jurno keeps the last file in `localStorage`.

## Layout

| Path | Contents |
| --- | --- |
| `apps/web` | Front end (Vite, React) |
| `apps/auth` | Auth service (Better Auth) |
| `apps/prices` | Prices service: chart candles from TradingView (unofficial TradingView-API) |
| `crates/engine` | Rust analytics engine |
| `crates/api` | Rust HTTP API |
| `docs/architecture.md` | Service contract: routes, tables, types |

## Development

You need Docker, Node 22, Rust and [just](https://github.com/casey/just).

```bash
just setup   # first run: creates .env with a secret, installs npm packages
just dev     # Postgres, auth, prices, API and web together. Open http://localhost:5173
```

Ctrl+C stops all of them. Run `just` to see every task:

| Task | What it does |
| --- | --- |
| `just db`, `just auth`, `just prices`, `just api`, `just web` | Start one part on its own, each in its own terminal |
| `just plan alice espresso` | Put a user on a plan (`free`, `espresso`, `latte` or `owner`) |
| `just owner alice` | Give a user the owner plan: everything, no account limit |
| `just delete-user alice` | Delete a user and all their data (cannot be undone) |
| `just users` | List users with their plan, trading accounts and trades |
| `just psql` | Open a database shell |
| `just test` | Rust tests (with their own Postgres), web build and lint |
| `just check` | Rust format and clippy, in Docker |
| `just up`, `just down`, `just reset` | All services in containers, stop them, stop and delete the database |

On Railway, the same account commands run in the api container: see [docs/deploy.md](docs/deploy.md#admin-commands).

The steps below do the same by hand.

### Without just

You need Docker, Node 22 and Rust. Run each command from the repo root unless the step says otherwise.

1. Copy the settings file and set a secret:
   ```bash
   cp .env.example .env
   openssl rand -base64 32   # paste the output as BETTER_AUTH_SECRET in .env
   ```
2. Start Postgres (port 5433):
   ```bash
   docker compose up -d postgres
   ```
3. Start the auth service. It restarts when you save a file:
   ```bash
   cd apps/auth && npm install && npm run dev        # port 3001
   ```
4. In another terminal, start the prices service. The trade chart gets its candles from it:
   ```bash
   cd apps/prices && npm install && npm run dev      # port 3002
   ```
   Set `PRICES_URL=http://localhost:3002` in `.env` (it is in `.env.example`).
5. In a second terminal, start the API:
   ```bash
   cargo run -p api                                   # port 8080
   ```
   Run it again after you change Rust code.
6. In a third terminal, start the web app. It reloads when you save a file:
   ```bash
   cd apps/web && npm install && npm run dev          # http://localhost:5173
   ```

Open http://localhost:5173. Vite sends `/api/auth` to the auth service and the rest of `/api` to the API.

To try a paid plan, put your user on it:

```bash
docker compose exec postgres psql -U jurno -d jurno -c "update profiles set plan = 'espresso' where user_id = (select id from \"user\" where username = 'yourname')"
```

To run everything in containers instead, use `docker compose up -d --build` and step 6.

### Tests

```bash
docker run -d --rm -p 55432:5432 -e POSTGRES_PASSWORD=pg postgres:17
cargo test --workspace
cd apps/web && npm run build && npm run lint
```

## Input

Use an Exness or MetaTrader 5 CSV export with these columns:

`ticket, opening_time_utc, closing_time_utc, type, lots, symbol, opening_price, closing_price, stop_loss, take_profit, commission, swap, profit, close_reason`

## Views

- **Overview**: daily P&L, results by symbol and side.
- **Notes** (paid): one card for each finding, grouped into what hurts, what helps and what is worth a look.
- **Plan** (paid): rules found by the optimizer, tested on days it did not see.
- **Timing** (paid): P&L by hour, weekday and holding time.
- **Frequency** (paid): daily trade cap, results by trade number, busy and quiet days.
- **Risk**: position size, close reason, daily loss limit, trades after a loss.
- **Trades**: all trades, newest first.

The **Share** button makes a 1200 × 630 PNG stats card for the current filters. You can copy it or download it.

## Optimizer

The optimizer splits your trading days. It fits rules on the first 70% and tests them on the last 30%.

1. Sort losing hours and weekdays from worst to best.
2. Skip them one at a time. Stop when fewer than 40% of trades remain.
3. For each skip set, try every daily trade cap and daily loss limit.
4. Keep the rule set with the highest net P&L on the fit days. Looser rules win ties.
5. Show the result on the test days.

The test assumes each trade is independent. A skipped trade does not change later trades.

## Code layout

| Path | Contents |
| --- | --- |
| `apps/web/src/lib/trades/` | Pure data logic: parse, group, timezone, stats, simulations, optimizer |
| `apps/web/src/lib/insights.ts` | Notes generated from the stats |
| `apps/web/src/lib/share-card.ts` | Draws the share card on a canvas |
| `apps/web/src/lib/format.ts`, `storage.ts` | Formatters and safe `localStorage` |
| `apps/web/src/hooks/` | `useTradeFile`, `useFilters`, `useTheme` |
| `apps/web/src/components/charts/` | Chart components (Recharts) |
| `apps/web/src/components/dashboard/` | Dashboard cards, tables and the tab views in `views/` |
| `apps/web/src/components/upload/`, `layout/`, `brand/` | Welcome screen, header, logo |
| `apps/web/src/components/ui/` | shadcn/ui primitives |

See [docs/saas-plan.md](docs/saas-plan.md) for the plan to add accounts, storage and billing.

Stack: Vite, React, TypeScript, Tailwind CSS v4, shadcn/ui, Recharts.
