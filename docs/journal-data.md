# Journal data

What Jurno asks about each trade and each day, how each answer is entered, and how it is stored.
The goal is the information a full trading journal collects (setup, grade, mistakes, plan, emotion,
risk) with almost no typing: taps, swipes and a confirm, and one optional text box last.

Status: the prototype runs on the mock API (`VITE_MOCK=1`). There are no tables or Rust routes yet.
The API below is the contract for building them.

## Principles

- Every answer is optional. Blank means "not answered", never "no", so skipped trades stay out of the stats instead of skewing them.
- Text comes last and is optional. Everything before it is a tap, a swipe or a confirm.
- Trade data comes from the CSV. The journal never asks for anything the import already has.
- Setups and mistake tags belong to the person, not the trading account, so they are shared across accounts.
  Reviews belong to the trading account, like trades.

## Per trade

| # | Question | Input | Stored as | Unlocks |
| --- | --- | --- | --- | --- |
| 1 | Did you follow your plan? | Swipe the review card: right yes, left no | `followedPlan: boolean \| null` | P&L on plan vs off plan |
| 2 | Which setup was it? | Tap one chip from your setups | `setupId \| null` | P&L and win rate by setup |
| 3 | How good was the setup? | Tap A, B or C | `grade: 'A' \| 'B' \| 'C' \| null` | Whether A setups beat C setups |
| 4 | What went wrong? | Tap any number of mistake chips ("None" is a chip too) | `mistakeIds: string[]` | The cost of each mistake |
| 5 | How did you feel? | Tap one of five faces | `mood: 1-5 \| null` | P&L by mood |
| 6 | What did you risk? | Confirm or edit the starting stop, asked only when the CSV stop looks moved | `initialStop: number \| null` | Result in R |
| 7 | Anything else? | Text, last, optional, up to 500 characters | `note: string \| null` | Context |

Moods: 1 Awful, 2 Bad, 3 Okay, 4 Good, 5 Great.

`mistakeIds` empty with `noMistakes: true` means the trader tapped "None". Empty with `noMistakes: false` means not answered.

### Preset mistake tags

Created for every person on first use. They can be renamed or archived, not deleted, and people can add their own.

| Group | Tags |
| --- | --- |
| Entry | FOMO, Late entry, No setup, Revenge |
| Exit | Early exit, Held too long, Moved stop |
| Size and risk | Oversized, No stop |
| Mindset | Tired, Distracted, Bored |

### When to ask for the starting stop

The CSV has only the last stop loss. Ask for the starting stop only when that last stop looks moved:

- there is no stop loss, or
- the stop is at the entry price or on the profit side of it (buy: `stopLoss >= openPrice`; sell: `stopLoss <= openPrice`), which means it was moved to breakeven or trailed.

Otherwise the CSV stop is taken as the starting stop and nothing is asked. A confirmed `initialStop` always wins.

### Result in R

`R = (closePrice - openPrice) × direction ÷ |openPrice - stop|`, where direction is 1 for buy and -1 for sell, and stop is
`initialStop`, else the CSV stop when it was not moved. No stop: no R. It uses prices only, so contract sizes do not matter.
For a position with partial closes, use the lot-weighted average close price.

## Per day

| When | Question | Input | Stored as |
| --- | --- | --- | --- |
| Before trading | How do you feel? | Tap a face (daily check-in popup, on by default) | `preMood: 1-5 \| null` |
| Before trading | What could get in the way today? | Tap chips: Tired, News day, Distracted, Chasing losses, None | `risks: string[]`, `noRisks: boolean` |
| Before trading | What are you watching? | Tap setups from your list | `watchSetupIds: string[]` |
| After trading | Did you stick to your plan today? | Swipe yes or no | `followedPlan: boolean \| null` |
| After trading | One thing to change | Text, last, optional | `note: string \| null` |

Day risk chips are a fixed list for now: `tired`, `news`, `distracted`, `chasing`.

## Review flow

The day sheet gets a "Review trades" button that opens a stack of cards, one per position not reviewed yet, oldest first.

1. Swipe right (or press the right arrow, or tap "On plan"): `followedPlan = true`. The next card comes up.
2. Swipe left (or left arrow, or "Off plan"): `followedPlan = false`, and the mistake chips open. Tap one or more, then "Next".
3. Tap the card (or "More") for the rest: setup, grade, face, starting stop when asked, note.
4. After the last card: "Day reviewed", with the after-trading questions for the day.

Buttons always do the same as the swipes, so the flow works with a mouse, a keyboard and a screen reader.

## Data model

```sql
-- Per person
create table setups (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null check (char_length(name) between 1 and 40),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table mistake_tags (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null check (char_length(name) between 1 and 40),
  grp text not null check (grp in ('entry', 'exit', 'size', 'mindset')),
  preset boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Per trading account. A trade review is keyed by ticket, so partial closes share one
-- and re-importing a CSV never removes it.
create table trade_reviews (
  account_id uuid not null references trading_accounts on delete cascade,
  ticket text not null,
  followed_plan boolean,
  setup_id uuid references setups on delete set null,
  grade text check (grade in ('A', 'B', 'C')),
  mood smallint check (mood between 1 and 5),
  no_mistakes boolean not null default false,
  initial_stop double precision,
  note text check (char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (account_id, ticket)
);
create table trade_mistakes (
  account_id uuid not null,
  ticket text not null,
  mistake_id uuid not null references mistake_tags on delete cascade,
  primary key (account_id, ticket, mistake_id),
  foreign key (account_id, ticket) references trade_reviews on delete cascade
);
create table day_reviews (
  account_id uuid not null references trading_accounts on delete cascade,
  day date not null,
  pre_mood smallint check (pre_mood between 1 and 5),
  risks text[] not null default '{}',
  no_risks boolean not null default false,
  watch_setup_ids uuid[] not null default '{}',
  followed_plan boolean,
  note text check (char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (account_id, day)
);
```

A review row whose answers are all blank is deleted.

## API

All JSON, camelCase, session required, errors `{ "error": "<plain message>" }`. Routes with `:id` check that the trading account belongs to the user (404).

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/journal/tags` | | `{ setups: Setup[], mistakes: MistakeTag[] }`. Creates the preset mistake tags on first call. Archived ones are included with `archived: true`. |
| `POST /api/journal/setups` | `{ name }` | `Setup` |
| `PATCH /api/journal/setups/:setupId` | `{ name?, archived? }` | `Setup` |
| `POST /api/journal/mistakes` | `{ name, group }` | `MistakeTag` |
| `PATCH /api/journal/mistakes/:mistakeId` | `{ name?, archived? }` | `MistakeTag` |
| `GET /api/accounts/:id/journal` | query: `tz` | `Journal` |
| `PATCH /api/accounts/:id/journal/trades/:ticket` | any fields of `TradeReviewInput` | `TradeReview`, or `204` when every answer is blank (row deleted). Fields left out are kept; `null` clears. |
| `PATCH /api/accounts/:id/journal/days/:day` | any fields of `DayReviewInput` | `DayReview`, or `204` |
| `GET /api/accounts/:id/journal/summary` | query: `tz` | `JournalSummary`. `{ locked: true }` on Free. |

```ts
Setup       = { id, name, archived }
MistakeTag  = { id, name, group: 'entry' | 'exit' | 'size' | 'mindset', preset, archived }

TradeReviewInput = { followedPlan?, setupId?, grade?, mood?, mistakeIds?, noMistakes?, initialStop?, note? }
TradeReview = { ticket, followedPlan, setupId, grade, mood, mistakeIds, noMistakes, initialStop, note, updatedAt }
DayReviewInput = { preMood?, risks?, noRisks?, watchSetupIds?, followedPlan?, note? }
DayReview   = { day, preMood, risks, noRisks, watchSetupIds, followedPlan, note, updatedAt }

Position    = { ticket, day, open, symbol, side, lots, net, openPrice, closePrice, stopLoss,
                askStop: boolean,   // the CSV stop looks moved, so ask for the starting stop
                r: number | null }  // result in R from initialStop, else the CSV stop when not moved
Journal     = { positions: Position[],             // every position in the account, newest first
                trades: TradeReview[], days: DayReview[],
                stats: { day, trades, net }[] }    // one row per day with a review or a trade

Row         = { key, trades, net, winRate, avgR }  // key: a mood 1-5, setup id, grade, mistake id, 'yes'/'no'
JournalSummary = { minTrades: 10, minDays: 10,
                   byMood: Row[],          // days, from day preMood (trades = days here)
                   bySetup: Row[], byGrade: Row[], byMistake: Row[], byPlan: Row[] }  // trades
```

The server computes `askStop`, `r` and the summary (numbers stay on the server, see `architecture.md`).
The web app shows a group in a chart once it has `minTrades` trades (`minDays` days for moods), and "needs N more" otherwise.

## Plans

Answering, the review flow, setups and mistake tags, and the journal list: every plan.
The summary charts (by setup, grade, mistake, plan, mood): Espresso and up.
