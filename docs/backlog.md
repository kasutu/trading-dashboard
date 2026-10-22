# Feature backlog

Requested features, newest last. Move an item to "Done" with the PR link when it ships.

## Open

### Journal and trade chart: from prototype to product

The prototype ([#5](https://github.com/kasutu/trading-dashboard/pull/5)) runs on the mock API only.

- Build the real tables and API from `docs/journal-data.md` (Rust routes, migrations, tests). `Position` now has `close` for the day timeline.
- Move the check-in setting from the browser to `profiles`.
- Pick a price-data provider for the trade chart's candles (options in `docs/architecture.md`).

## Done

- **P&L by hour uses the opening time.** Already the case: the engine takes the hour from the opening time and the chart says "Hour the trade was opened". No change needed.
- **Best lot size per instrument.** `bestLots` in the engine picks the best and worst size per symbol (at least 5 trades per size), shown in Risk as "Best lots per instrument", with a "Best size on {symbol}" note. [#3](https://github.com/kasutu/trading-dashboard/pull/3)
- **Weekly and monthly profit.** `byWeek` (weeks start Monday) and `byMonth` in the engine, on the user's timezone, shown on Overview as a Weekly | Monthly P&L bar chart. Free plan. [#3](https://github.com/kasutu/trading-dashboard/pull/3)
- **Deposits and withdrawals.** Entered by hand per trading account (the trade CSV has none): new `cash_flows` table and `/api/accounts/:id/cash-flows` routes, a Funding tab with totals and a timeline, and markers on the equity curve. [#4](https://github.com/kasutu/trading-dashboard/pull/4)
- **Journal prototype: UX and UI pass.** The journal has its own tab, and Notes holds only the automatic notes. Each journal day is one line, grouped by month, with a strip of its trades. Open a day for its answers. A banner shows the newest day to review. The review card shows the trade on its day, the holding time and the setup chips. The progress bar has one segment for each trade. The check-in shows your last "one thing to change" and has no disabled button.
- **Overtrading chart.** `overtrading` in the engine (paid): the best holding time is the `byDuration` bucket with the highest net (at least 5 trades, net above 0). For each day, the allowed trades are the minutes in the market (overlapping trades count once) divided by that bucket's median holding time, rounded down, at least 1. A day with more trades than allowed is over. Frequency shows trades taken and trades allowed as two lines, with the days over in red. Click a day to see its timeline. A note in Notes compares days over with other days. First open to last close was tried first, but it allowed 80 trades on a long day and flagged nothing.
- **Trade timeline (Gantt).** One bar for each trade from open to close, with the time in the market on top. It shows in the day sheet and from the overtrading chart. Click a trade for its price chart. The same strip, smaller, shows on each journal day and on the review card.
