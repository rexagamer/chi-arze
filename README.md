# چی‌ارزه؟ (ChiArzeh)

A Persian Telegram bot for discovering and comparing **community-reported prices
of mobile accessories in Iran** — "how much is it really worth?"

Every number the bot shows is a report from a real user, reviewed before it is
published. The bot never invents prices, never scrapes shops, and never guesses.

## Runs on Telegram Serverless

There is no server, container, worker, or external database:

- Handlers in `tgcloud/handlers/` run in Telegram's V8 isolates, invoked per update.
- Data lives in the bot's built-in SQLite database, reached through `sdk/db`.
- The only things a module may import are the platform SDK (`sdk`, `sdk/db`) and
  this project's own modules — there are no runtime npm packages.

## Layout

```
tgcloud/
├─ schema.js              # users, products, price_reports, report_flags
├─ handlers/
│  ├─ message.js          # command router (and the admin authorisation gate)
│  └─ callback_query.js   # inline keyboard presses (menu, catalog paging)
└─ lib/
   ├─ normalize.js        # THE normalization: Persian/Arabic folding, digits
   ├─ search.js           # pure query → LIKE patterns, ranking
   ├─ catalog.js          # products table: seed, list, search, lookup
   ├─ catalog-data.js     # the seed catalog + category labels (pure data)
   ├─ report-input.js     # pure parsing/validation of /report input
   ├─ reports.js          # submission, rate limit, price summaries (SQL)
   ├─ moderation.js       # pending queue, approve/reject, flags (SQL)
   ├─ summary.js          # pure statistics and reliability rules
   ├─ users.js            # Telegram user → internal user row
   ├─ config.js           # admin IDs, price/report/search limits
   ├─ input.js            # toman parsing, id parsing, validation
   ├─ format.js           # Persian digits, toman, relative time
   ├─ text.js             # every user-facing Persian string
   ├─ views.js            # composes data + copy + keyboard into a screen
   ├─ keyboards.js        # inline keyboards and callback-data contract
   └─ telegram.js         # HTML send/edit/answer helpers
tests/                    # offline tests (never deployed), incl. an sdk double
scripts/check.js          # offline parse + import-graph check
docs/tgcloud-sdk.md       # platform SDK reference
```

Only `.js` files under `tgcloud/` are deployed. `tests/`, `scripts/` and every
Markdown file stay local.

## Getting started

```bash
npm install

# 1. Link the project to a bot:
#    @BotFather → your bot → Serverless → CLI Access → Access token
npx tgcloud login

# 2. Deploy the code.
npm run deploy            # tgcloud push

# 3. Create the tables. Deploying never touches the database.
npm run migrate           # tgcloud migrate

# 4. Load the catalog: send /seed to the bot from an admin account (see below).
```

## Becoming an administrator

Administrators are configured by **numeric Telegram user ID**, in
`tgcloud/lib/config.js`:

```js
export const ADMIN_IDS = [123456789];
```

Precise steps:

1. Send `/id` to the bot. It replies with your ID in Latin digits, ready to paste.
2. Add that number to the `ADMIN_IDS` array. Keep other people's IDs out of a
   public fork.
3. `npm run deploy`, then send `/admin` to confirm the panel opens.

There is no environment variable, no secret and no token involved: the ID is a
public number, and the bot token itself is managed by Telegram Serverless and
never appears in this repository. Usernames and first names are never used for
authorisation — both can be changed by the user at any time.

## Commands

### For everyone

| Command | What it does |
| --- | --- |
| `/start` | Welcome, and registers the user |
| `/products` | Browse the catalog; `/products 2` jumps to page 2 |
| `/search <query>` | Search products (plain text works too) |
| `/product <id>` | Published prices for one product (`/price <id>` is an alias) |
| `/report <id> \| <price> \| <store> \| [url]` | Submit a price report |
| `/flag <report_id>` | Flag a published report as suspicious |
| `/help`, `/about`, `/id` | Help, background, your Telegram ID |

### For administrators

| Command | What it does |
| --- | --- |
| `/admin` | Counts and the command list |
| `/pending` | The moderation queue, oldest first |
| `/inspect <id>` | One report in full: price, store, source, flags, outlier hint |
| `/approve <id>` | Publish a pending report |
| `/reject <id> [reason]` | Reject it, optionally recording a reason |
| `/seed` | Load/refresh the catalog (idempotent) |

### In the terminal

| Command | What it does |
| --- | --- |
| `npm run deploy` | Deploy changed modules (`tgcloud push`) |
| `npm run migrate` | Apply pending schema changes |
| `npm run status` / `npm run diff` | Local vs. deployed, offline |
| `npm run check` | Parse every module and resolve every import |
| `npm test` | Run the test suite |

## Reporting rules

`/report 5 | 4,850,000 | دیجی‌کالا | https://shop.example/p/12`

The URL is optional. Everything is validated twice: shape in
`lib/report-input.js` (pure), and storage rules in `lib/reports.js` (database).

| Rule | Behaviour |
| --- | --- |
| Currency | **Toman only.** Rial amounts are rejected, never converted. Every message says تومان. |
| Price format | Whole toman in Persian, Arabic-Indic or Latin digits; `4,850,000`, `۴٬۸۵۰٬۰۰۰` and `۱.۵ میلیون` are accepted. Decimals without a multiplier (`1250.5`), negatives, unsafe integers and non-numbers are rejected. |
| Price bounds | 1,000 … 100,000,000 toman (`PRICE_LIMITS`). |
| Product | Must exist and be active; the id is shown in `/products` and `/search` as `#N`. |
| Store | Required, 1–60 characters, kept exactly as typed (only whitespace is tidied). |
| Source URL | Optional, must be `http(s)`, ≤ 200 characters. **Never fetched** — it is supporting information, not proof. |
| Duplicate | Same person + product + price + store within 24 h is refused; after that the same price may be reported again. |
| Rate limit | 5 reports per 24 h per user, enforced in the database (see below). |
| Initial status | Always `pending`. A report is never published on submission. |

**The rate limit is one SQL statement**, so two simultaneous submissions cannot
both slip past it:

```sql
INSERT INTO price_reports (…) SELECT …
WHERE (SELECT COUNT(*) FROM price_reports WHERE user_id = ? AND created_at >= ?) < 5
RETURNING id
```

There are no in-memory counters and no external service; the database is the
only state, and it survives between invocations.

## Price summaries

`/product <id>` shows only **approved** reports from the last 90 days, read with
a date filter and a row cap — never the whole history.

The rules that decide what can be said:

- **Median only with ≥ 3 distinct contributors.** Three reports from one person
  are one opinion; the bot says how many people are missing instead.
- **Range only with ≥ 2 contributors.**
- **Pending reports are counted separately** and never mixed into the numbers.
- **Rejected reports never appear.**
- **Staleness:** if the newest approved report is older than 30 days, the page
  says so.
- No confidence percentages, no "verified" badge, and no claim that a shop has
  stock at that price.

## Moderation

A report moves `pending → approved` or `pending → rejected`, once. Each decision
is a single guarded update:

```sql
UPDATE price_reports SET status = 'approved', reviewed_at = unixepoch(), reviewed_by = ?
WHERE id = ? AND status = 'pending' RETURNING id
```

so a repeated command or two administrators racing cannot decide the same report
twice or change a decision already made.

Flags (`/flag`) are a signal, not a verdict: one flag never changes a report's
status, flags are unique per person per report (enforced by a UNIQUE index), and
authors cannot flag their own report.

**Outlier hint** (administrators only): with at least 5 recent approved reports
for the product, a submission more than 50% away from the median is marked
`⚠️ دور از میانه` in `/pending` and `/inspect`. It is advice for the reviewer —
nothing is rejected automatically, and the reporter is told their price will be
checked more carefully.

## Database

| Table | Purpose |
| --- | --- |
| `users` | One row per Telegram account: `tg_id` (identity), first name, status. |
| `products` | Catalog: name, **unique** normalized name, category, keywords, active flag. |
| `price_reports` | id, product, user, integer toman, store name + folded store key, source URL, status, review metadata. |
| `report_flags` | report, user, timestamp — unique per (report, user). |

No foreign keys (the platform runs with them off): `product_id`, `user_id` and
`report_id` are validated in application code. Indexes exist for the three real
access patterns — product feed, per-user history, moderation queue.

### Schema changes are separate from code deploys

```bash
npm run deploy                 # uploads schema.js; reports what the DB would change
npm run migrate                # reviews and applies those changes
npm run migrate -- --dry-run   # preview only
```

Nothing runs migrations at request time and no handler creates or resets a table.

### Catalog seeding

`/seed` (administrator only) inserts any product whose normalized name is not in
the database yet. It is idempotent, contains no prices, and is the only way the
catalog is written — never on a message, never on module load.

## Tests

```bash
npm test          # the offline suite
npm run check     # parse + import graph
```

`node --test` only, no test framework. Two layers:

- **Pure modules** (`normalize`, `search`, `report-input`, `summary`, `format`)
  are tested directly.
- **Database logic** runs against real SQLite via `node:sqlite`, with a small
  `sdk` double (`tests/support/sdk.mjs`). The tables are created from
  `tgcloud/schema.js` itself, so a missing UNIQUE index or CHECK constraint fails
  a test instead of hiding — remove the flag index from `schema.js` and three
  tests fail. That is what makes rate limits, duplicate detection, guarded status
  changes and summaries testable without deploying.

The double is a double: it re-implements the query builder and only executes the
raw-SQL paths as written. SDK-specific behaviour still has to be confirmed with
`npx tgcloud run handlers/message '{ … }'`.

## Roadmap

1. Product selection with buttons instead of typed ids.
2. "My reports", including pending and rejected ones with the reviewer's note.
3. Notify administrators when a report collects several flags.
