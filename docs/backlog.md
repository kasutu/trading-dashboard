# Feature backlog

Requested features, newest last. Move an item to "Done" with the PR link when it ships.

## Open

### 1. Deposits and withdrawals

Show how many deposits and withdrawals were made, the total of each, and a chart of when they happened.

- Now: not supported. The trade CSV has only closed trades, so there is no deposit or withdrawal data.
- Needs a data source first. Options: import the broker's transaction or balance report (a second CSV type), or let the user add them by hand.
- Chart idea: mark each deposit and withdrawal on the equity curve on the day it happened, so a jump in balance is not mistaken for trading profit.
- New table (for example `cash_flows`: account, time, type, amount), API routes, and a line in `architecture.md`.

### 2. Best lot size per instrument

For each instrument, show which lot size made the most money (and which lost the most).

- Now: partly there. `by_lots` in the engine already groups by symbol and lot size ("XAUUSD · 0.2"), shown in Risk as "P&L by position size". Nothing picks the best size per instrument.
- Add: a per-instrument pick in the engine (minimum trade count so one lucky trade does not win), a "Best lots on {instrument}" view, and an insight note.

### 3. Weekly and monthly profit

Net P&L per week and per month, as charts.

- Now: only the trading calendar shows a total for the month on screen. No weekly totals, no monthly chart.
- Add: `by_week` and `by_month` in the engine (weeks start Monday, in the user's timezone), and green/red bar charts with trades and win rate in the tooltip.

### 4. P&L by hour uses the opening time

The hourly chart should show the best hours to open a trade, not to close it.

- Now: already done. The engine takes the hour from the opening time (`hour: open.hour()` in `crates/engine/src/lib.rs`), and the chart says "Hour the trade was opened". The weekday and hour heatmap uses the opening time too.
- Open question: if something still looks like it uses the closing time, find which view. If the ask is a clearer "best hours to open" summary (for example the top 3 hours highlighted), add that.

## Done
