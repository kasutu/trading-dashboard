# Feature backlog

Requested features, newest last. Move an item to "Done" with the PR link when it ships.

## Open

### 1. Deposits and withdrawals

Show how many deposits and withdrawals were made, the total of each, and a chart of when they happened.

- Now: not supported. The trade CSV has only closed trades, so there is no deposit or withdrawal data.
- Needs a data source first. Options: import the broker's transaction or balance report (a second CSV type), or let the user add them by hand.
- Chart idea: mark each deposit and withdrawal on the equity curve on the day it happened, so a jump in balance is not mistaken for trading profit.
- New table (for example `cash_flows`: account, time, type, amount), API routes, and a line in `architecture.md`.

## Done

- **P&L by hour uses the opening time.** Already the case: the engine takes the hour from the opening time and the chart says "Hour the trade was opened". No change needed.
- **Best lot size per instrument.** `bestLots` in the engine picks the best and worst size per symbol (at least 5 trades per size), shown in Risk as "Best lots per instrument", with a "Best size on {symbol}" note. (PR link)
- **Weekly and monthly profit.** `byWeek` (weeks start Monday) and `byMonth` in the engine, on the user's timezone, shown on Overview as a Weekly | Monthly P&L bar chart. Free plan. (PR link)
