# Feature backlog

Requested features, newest last. Move an item to "Done" with the PR link when it ships.

## Open

### Journal: what is left

- Move the check-in setting from the browser to `profiles`.
- Inline rename and archive for setups and mistake tags (adding is inline; rename and archive are in Settings).

### MT4 detailed report import

- Needs a sample MT4 "Detailed Statement" file. The MT5 report import (`crates/engine/src/mt5.rs`) is the model.

## Done

- **P&L by hour uses the opening time.** Already the case: the engine takes the hour from the opening time and the chart says "Hour the trade was opened". No change needed.
- **Best lot size per instrument.** `bestLots` in the engine picks the best and worst size per symbol (at least 5 trades per size), shown in Risk as "Best lots per instrument", with a "Best size on {symbol}" note. [#3](https://github.com/kasutu/trading-dashboard/pull/3)
- **Weekly and monthly profit.** `byWeek` (weeks start Monday) and `byMonth` in the engine, on the user's timezone, shown on Overview as a Weekly | Monthly P&L bar chart. Free plan. [#3](https://github.com/kasutu/trading-dashboard/pull/3)
- **Deposits and withdrawals.** Entered by hand per trading account (the trade CSV has none): new `cash_flows` table and `/api/accounts/:id/cash-flows` routes and a Funding tab with totals and a timeline. (Markers on the equity curve were removed later to keep the chart clean.) [#4](https://github.com/kasutu/trading-dashboard/pull/4)
- **Journal prototype: UX and UI pass.** The journal has its own tab, and Notes holds only the automatic notes. Each journal day is one line, grouped by month, with a strip of its trades. Open a day for its answers. A banner shows the newest day to review. The review card shows the trade on its day, the holding time and the setup chips. The progress bar has one segment for each trade. The check-in shows your last "one thing to change" and has no disabled button.
- **Overtrading chart.** `overtrading` in the engine (paid): the best holding time is the `byDuration` bucket with the highest net (at least 5 trades, net above 0). For each day, the allowed trades are the minutes in the market (overlapping trades count once) divided by that bucket's median holding time, rounded down, at least 1. A day with more trades than allowed is over. Frequency shows trades taken and trades allowed as two lines, with the days over in red. Click a day to see its timeline. A note in Notes compares days over with other days. First open to last close was tried first, but it allowed 80 trades on a long day and flagged nothing.
- **Trade timeline (Gantt).** One bar for each trade from open to close, with the time in the market on top. It shows in the day sheet and from the overtrading chart. Click a trade for its price chart. The same strip, smaller, shows on each journal day and on the review card.
- **Journal backend, mock removed.** Tables (`0004_journal.sql`), routes (`routes/journal.rs`) and the engine module (`journal.rs`) from `docs/journal-data.md`, with tests. The web app's fake backend (`VITE_MOCK`, `just mock`) is deleted. The trade chart's SL and TP save as `initialStop` and the new `initialTarget`.
- **Trade chart candles.** The API reads them from TradingView's chart websocket (`src/tradingview.rs`), free and without an extra service, and keeps every bar in `candles` with the ranges asked in `candle_ranges`, so each range is fetched once. Without a TradingView account, older trades get longer candles (the chart says so).
- **MT5 report import.** Drop the HTML report from MetaTrader 5's History tab on the import page: a server dry run shows the account, the positions to import, deposits, withdrawals and adjustments; the import adds one trade per position (close reason from its deals), the balance operations as cash flows (Exness `D-NULL` negative balance resets as the new `adjustment` kind) and remembers the account's MetaTrader login. Re-imports and tickets already stored from a CSV are skipped.
