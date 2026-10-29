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
├─ schema.js              # tables: users, products, price_reports, report_flags
├─ handlers/
│  ├─ message.js          # commands, and free text as a catalog search
│  └─ callback_query.js   # inline keyboard presses (menu, catalog paging)
└─ lib/
   ├─ normalize.js        # THE normalization: Persian/Arabic folding, digits
   ├─ search.js           # pure query → LIKE patterns, ranking
   ├─ catalog.js          # products table: seed, list, search, lookup
   ├─ catalog-data.js     # the seed catalog + category labels (pure data)
   ├─ users.js            # Telegram user → internal user row
   ├─ config.js           # admin IDs, price/text/search limits
   ├─ input.js            # toman parsing, id parsing, validation
   ├─ format.js           # Persian digits, toman, relative time
   ├─ text.js             # every user-facing Persian string
   ├─ views.js            # composes data + copy + keyboard into a screen
   ├─ keyboards.js        # inline keyboards and callback-data contract
   └─ telegram.js         # HTML send/edit/answer helpers
tests/                    # offline unit tests (never deployed)
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

### Become an administrator

Moderation and seeding are limited to the Telegram user IDs listed in
`tgcloud/lib/config.js`:

```js
export const ADMIN_IDS = [123456789];
```

Send `/id` to the bot to get your numeric ID (Latin digits, ready to paste), add
it, and redeploy. Nothing here is a secret — the bot token is managed by Telegram
Serverless and never appears in this repository.

## Commands

### In the bot

| Command | What it does |
| --- | --- |
| `/start` | Welcome, and registers the user |
| `/products` | Browse the catalog, 6 per page; `/products 2` jumps to page 2 |
| `/search <query>` | Search products, or just type the query |
| `/help`, `/about` | How the bot works |
| `/id` | Your numeric Telegram ID |
| `/seed` | **Admin only.** Loads the catalog; safe to run repeatedly |

### In the terminal

| Command | What it does |
| --- | --- |
| `npm run deploy` | Deploy changed modules (`tgcloud push`) |
| `npm run migrate` | Apply pending schema changes to the database |
| `npm run status` | Show local vs. deployed modules (offline) |
| `npm run diff` | Line-by-line diff against the last known deploy (offline) |
| `npm run check` | Parse every deployed module and verify its imports |
| `npm test` | Unit-test the pure modules |
| `npm run run -- handlers/message '{ chat: { id: 1 }, text: "/products" }'` | Execute a handler on the platform with local files |

## Database

Four tables, all in `tgcloud/schema.js`.

| Table | Purpose |
| --- | --- |
| `users` | One row per Telegram account: `tg_id` (identity), first name, status, created at. |
| `products` | The catalog: display name, **unique** normalized name, category, search keywords, active flag. |
| `price_reports` | A report: product, user, integer toman, store, source URL, status, plus moderation metadata (reviewer, time, note). |
| `report_flags` | "This looks wrong" votes: report, user, time. One per user per report. |

Constraints and indexes that exist for a reason:

- `users.tg_id` — UNIQUE. Identity is the numeric Telegram ID, not a username.
- `products.normalized_name` — UNIQUE. Makes seeding idempotent and makes a
  duplicate product impossible, not just unlikely.
- `price_reports (product_id, status, created_at)` — the product page.
- `price_reports (user_id, created_at)` — "my reports".
- `price_reports (status, created_at)` — the moderation queue.
- `report_flags (report_id, user_id)` — UNIQUE, so a flag cannot be counted twice
  (and it doubles as the index for "flags of this report").
- `CHECK` constraints keep money positive, statuses in `pending|approved|rejected`,
  user status in `active|blocked`, and product categories in the known set.

There are **no foreign keys**: the platform runs SQLite with foreign keys off, so
`product_id`, `user_id` and `report_id` are logical references validated in
application code (`getProductById()` returns null for an unknown id).

### Schema changes are separate from code deploys

```bash
npm run deploy            # uploads schema.js; reports what the DB would change
npm run migrate           # reviews and applies those changes
npm run migrate -- --dry-run   # preview only
```

Nothing runs migrations at request time, and no handler ever creates or resets a
table. Removing a table or column requires marking it `.deprecated('reason')` —
this project has no destructive migrations.

### Catalog seeding

The catalog is data, and it is loaded by an explicit administrator command:

```
/seed
```

Why a command rather than an automatic step: `tgcloud migrate` only applies
schema diffs (it has no data hook), and seeding from a message handler on first
use would race. `/seed` is explicit, admin-only and **idempotent** — it inserts
only products whose normalized name is not in the database yet, so it can be run
after every deploy that adds products, and re-running it reports
"already complete". It never touches prices: the catalog has none.

## Search

Queries and product names go through the same normalizer (`lib/normalize.js`):

1. Arabic `ي`/`ك` → Persian `ی`/`ک`; `أ إ آ` → `ا`; `ة`/`ۀ` → `ه`; tatweel dropped.
2. Persian `۰-۹` and Arabic-Indic `٠-٩` digits → Latin digits.
3. Zero-width non-joiner/space → a word break; bidi marks and harakat dropped.
4. Thousands separators between digits removed (`۱۰٬۰۰۰` and `10,000` → `10000`).
5. Other punctuation → a space (`USB-C` ≡ `USB C`); whitespace collapsed; lowercased.

Digits and letters are kept, so `۲۰ وات`/`۲۵ وات` and `۱۰۰۰۰`/`۲۰۰۰۰` stay
different products. Every word of a query must match the normalized name or the
keywords (brands and English terms live there), and results are ranked: exact
name first, then name matches, then keyword-only matches. Filtering happens in
SQL and is capped, so query cost does not grow with the catalog.

## Roadmap

1. A product page: recent approved reports, how fresh they are, how much they agree.
2. Submit a price report with validation and a confirmation step.
3. "My reports", including pending and rejected ones with the reviewer's note.
4. Flag a suspicious report.
5. Administrator moderation queue: approve, reject with a reason, resolve flags.
