# Feature backlog

Requested features, newest last. Move an item to "Done" with the PR link when it ships.

## Open

### Journal and trade chart: from prototype to product

The prototype ([#5](https://github.com/kasutu/trading-dashboard/pull/5)) runs on the mock API only.

- **Needs UX and UI enhancements** before it ships to users: the review flow, the check-in, the editors and the Notes insights.
- Build the real tables and API from `docs/journal-data.md` (Rust routes, migrations, tests).
- Move the check-in setting from the browser to `profiles`.
- Pick a price-data provider for the trade chart's candles (options in `docs/architecture.md`).

### Overtrading chart and trade timeline

**Overtrading line chart.** For each trading day, show how many trades I took against how many my best trade duration allows.

- Trades taken: count of trades opened that day (user's timezone).
- Trades my best duration allows: take my best duration bucket from `by_duration` (highest net P&L, same minimum-trades rule as `bestLots`), then divide the time I traded that day (first open to last close) by that bucket's median duration. Example: best bucket 15–60m with a 30 min median, 4 hours of trading → about 8 trades.
- Two lines on one chart: trades taken, and trades allowed. Days where taken is above allowed are overtrading days; mark them, and show the day's net P&L in the tooltip.
- Computed in the engine (Rust), with a parity test against the TS mock.

**Trade timeline (Gantt).** For a chosen day, one bar per trade from open time to close time, in the user's timezone.

- Rows ordered by open time; bar color by win or loss; overlapping bars show trades held at the same time.
- Tooltip: symbol, side, lots, duration, net P&L. Click opens the trade chart dialog.
- Reachable from the calendar day sheet and from an overtrading day on the chart above.

## Done

- **P&L by hour uses the opening time.** Already the case: the engine takes the hour from the opening time and the chart says "Hour the trade was opened". No change needed.
- **Best lot size per instrument.** `bestLots` in the engine picks the best and worst size per symbol (at least 5 trades per size), shown in Risk as "Best lots per instrument", with a "Best size on {symbol}" note. [#3](https://github.com/kasutu/trading-dashboard/pull/3)
- **Weekly and monthly profit.** `byWeek` (weeks start Monday) and `byMonth` in the engine, on the user's timezone, shown on Overview as a Weekly | Monthly P&L bar chart. Free plan. [#3](https://github.com/kasutu/trading-dashboard/pull/3)
- **Deposits and withdrawals.** Entered by hand per trading account (the trade CSV has none): new `cash_flows` table and `/api/accounts/:id/cash-flows` routes, a Funding tab with totals and a timeline, and markers on the equity curve. [#4](https://github.com/kasutu/trading-dashboard/pull/4)
