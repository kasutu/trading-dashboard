# Feature backlog

Requested features, newest last. Move an item to "Done" with the PR link when it ships.

## Open

### Journal: what is left

- Move the check-in setting from the browser to `profiles`.
- Inline rename and archive for setups and mistake tags (adding is inline; rename and archive are in Settings).

### MT4 detailed report import

- Needs a sample MT4 "Detailed Statement" file. The MT5 report import (`crates/engine/src/mt5.rs`) is the model.

### Email the daily reminder

Send the Today card's plan (kind of day, trades left, loss limit, best and skip hours) by email, so it arrives when Jurno is not open. The browser notification only works with Jurno open in a tab.

- **Settings:** an "Email me" switch (off by default) and a frequency: every trading day (Mon–Fri), every day, or weekly (Monday, with the week's best days). Plus a send time in the user's timezone. These must be saved on the server (a column on `profiles`), not in the browser like the current reminder settings, because the server sends the email.
- **Email address first:** accounts have no real email. Sign-up sets `<username>@users.jurno.invalid` (`apps/auth/src/server.ts`). Settings needs a field to add an address and verify it before the first send. Better Auth's email verification can do this.
- **Sending:** a scheduled job in the API (every 15 minutes, for example) finds the users whose send time has passed today and who have not been sent yet, builds the plan from `optimization` with the same rules as `today-card.tsx`, and sends through a provider such as Resend or Postmark. Record the last send day so each user gets at most one email a day.
- **Rules to share:** move the "kind of day" and "trades left" logic out of `today-card.tsx` into the engine, so the card and the email always say the same thing.
- **Unsubscribe:** every email needs a one-click unsubscribe link that turns "Email me" off, plus the `List-Unsubscribe` header.
- **Plans:** a Free account gets only today's trades and P&L, the same as the card.

### Playbook: plan trades before you take them

A place to plan trades with numbers only: symbol, side, entry, stop loss (SL), take profit (TP) and lots. No chart drawing. Jurno works out the rest, so you know the risk before you place the order.

- **Inputs:** symbol, buy or sell, entry, SL, TP and lots. An optional setup (from the journal setups) and a note.
- **Computed:** risk and reward in dollars, risk-to-reward ratio (R:R), risk as a % of the account balance, and the distance to SL and TP in points. Also lots from risk: enter a dollar risk or a % of the balance instead of lots, and Jurno works out the lot size.
- **Value per point:** the dollar value of one point per lot for each symbol. Work it out from the account's own trades (profit ÷ (price move × lots)), and let the user enter or correct it for symbols with no history.
- **Checks against the plan:** warn when the trade breaks the Today card's plan. For example: no trades left today, the risk is more than the loss-limit room, it is a skip hour or rest day, or the R:R is below the user's minimum.
- **Status:** each planned trade is planned, taken or skipped. After an import, match a taken trade to the actual trade (same symbol and side, opened near the planned entry on the same day). Then show plan against result: entry slippage, SL and TP moved, and lots changed. The review's `initialStop` and `initialTarget` can be filled from the plan.
- **Storage:** a new `planned_trades` table per trading account, with routes under `/api/accounts/:id/playbook`. The R:R and risk math goes in the engine, so the web app and any later email or alert use the same numbers.
- **Plans:** to decide which plans get it. One option: the calculator is free, and saving plans and comparing plan against result are paid.

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
- **Internal transfers in MT5 imports.** Balance deals whose comment has an `INT` part (Exness wallet and account moves) are flagged `internal` (`0006_internal_transfers.sql`, which also marks flows already imported). They still count as deposits and withdrawals; the Funding tab and the import preview show them as transfers, with an "Of which internal" total.
- **Bulk actions on deposits and withdrawals.** Tick entries (or all) to delete them or mark them internal or external at once: `POST /api/accounts/:id/cash-flows/bulk` with `{ ids, action }`. Adjustments are never marked internal.
