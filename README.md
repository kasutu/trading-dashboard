# Jurno

Jurno reads a broker trade history (CSV) and shows where you make and lose money.
The file stays in the browser. Jurno keeps the last file in `localStorage`.

## Layout

| Path | Contents |
| --- | --- |
| `apps/web` | Front end (Vite, React) |
| `apps/auth` | Auth service (Better Auth) |
| `crates/engine` | Rust analytics engine |
| `crates/api` | Rust HTTP API |
| `docs/architecture.md` | Service contract: routes, tables, types |

## Run the front end

```bash
cd apps/web
npm install
npm run dev      # http://localhost:5173
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
