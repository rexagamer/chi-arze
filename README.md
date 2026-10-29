# چی‌ارزه؟ (ChiArzeh)

A Persian Telegram bot that answers one question before you buy a mobile
accessory in Iran: **«چی‌ارزه؟» — what is it actually worth?**

Prices come from people who just bought the thing, not from a shop's marketing
page. Every report is reviewed by a human before it appears, and every screen
says how old the numbers are and how many people stand behind them.

> **Status:** the repository is complete and deployment-ready, but the bot has
> **not** been deployed. `npm run migrate` and `npm run deploy` have never been
> run against a live bot — they need BotFather access and a terminal. Everything
> below marked *verified locally* was checked with `npm test` / `npm run check`;
> everything that needs Telegram is marked as such.

---

## Features

Implemented, working, and tested:

- **Persian catalog** of 38 mobile accessories across 10 categories.
- **Search** that folds Persian/Arabic spelling, ZWNJ, diacritics and Persian,
  Arabic-Indic or Latin digits — `آيفون`, `آیفون` and `ایفون` are one query, and
  specs survive normalization (`20 W` ≠ `25 W`, `10,000` ≠ `20,000`).
- **Inline keyboards** for browsing, opening a product, paging, flagging a
  report, and approving or rejecting one.
- **Price reporting** in toman only, validated twice (shape and database).
- **Duplicate prevention** per user + product + price + store inside 24 hours.
- **Persistent rate limiting** — 5 reports per 24 hours per user, enforced by a
  single SQL statement, never by process memory.
- **Moderation** with `pending → approved | rejected`, one guarded UPDATE per
  decision, so nothing can be decided twice.
- **Honest summaries** — a median needs 3 distinct contributors, stale data is
  labelled, pending is counted but never mixed in, rejected never appears.
- **Flags** from users, one per person per report, never an automatic rejection.
- **Administrator allowlist** by numeric Telegram ID, checked in one place.
- **Error handling** that answers in Persian and logs the detail.

Not implemented (deliberately): a Mini App, price scraping, paid APIs, reputations
or dispute threads, and any background job.

---

## Architecture

```
tgcloud/                     ← everything here is deployed
├─ schema.js                 ← the database: 4 tables, declared once
├─ handlers/
│  ├─ message.js             ← one message update: the command router
│  └─ callback_query.js      ← one button press: validated, authorised, rendered
└─ lib/
   ├─ config.js              ← admin IDs and every limit/threshold
   ├─ normalize.js           ← the one normalization (text + digits)
   ├─ input.js               ← toman parsing, id parsing
   ├─ report-input.js        ← pure /report parsing → values or error codes
   ├─ summary.js             ← pure statistics and reliability rules
   ├─ format.js              ← Persian digits, toman, Jalali dates, HTML escaping
   ├─ search.js              ← pure query → LIKE patterns + ranking
   ├─ catalog-data.js        ← the seed catalog (data only, no prices)
   ├─ catalog.js             ← products table: seed, list, search, lookup
   ├─ reports.js             ← submission, rate limit, summaries (SQL)
   ├─ moderation.js          ← queue, approve/reject, flags (SQL)
   ├─ users.js               ← Telegram id → internal user row
   ├─ keyboards.js           ← buttons + the callback-data contract
   ├─ text.js                ← every Persian string
   ├─ views.js               ← data + copy + keyboard → one screen
   └─ telegram.js            ← sendMessage / editMessageText / answerCallbackQuery

tests/                       ← never deployed
├─ *.test.js                 ← 122 tests (`npm test`)
└─ support/{sdk,app,hooks}.mjs ← a SQLite-backed double of the platform SDK

scripts/check.js             ← parse + import-graph check (`npm run check`)
docs/tgcloud-sdk.md          ← platform SDK reference (shipped with the CLI)
```

**Layering, kept deliberately small.** Handlers route and authorise; `views.js`
composes a screen; `text.js` owns the words; `reports.js` / `moderation.js` /
`catalog.js` own the SQL; everything else is a pure function. There is no
repository layer, no DI container and no service objects — modules import what
they need.

**Two handlers, no conversation state.** Telegram sends one update per
invocation, and invocations share nothing but the database. Nothing is kept in a
module-level variable, so nothing has to expire: `/report` is one line of text,
and every button carries the ids it needs in its (≤64-byte) `callback_data`.

---

## Requirements

- **Node.js 22.5+** to work locally: the tests use the built-in `node:test`
  runner and `node:sqlite` (experimental, hence the `--no-warnings` in
  `npm test`). The deployed bot uses neither — it runs in the platform's isolate
  and only imports `sdk`.
- **`@tgcloud/cli` 0.2.0** (already a dev dependency) and a Telegram account.
- A bot created in **@BotFather** with **Serverless enabled**.
- No database to install, no hosting, no secrets in the repository.

```bash
npm install
```

---

## Initial setup

### 1. Create the bot

1. Open [@BotFather](https://t.me/BotFather) → `/newbot` → choose a name and a
   username. Keep the token BotFather gives you; it never goes in this repository.
2. In BotFather, open your bot → **Bot Settings → Serverless** → enable it.
3. In the same menu, generate **CLI Access** → you get an access token.

### 2. Authenticate the CLI

```bash
npx tgcloud login
```

It asks for the CLI access token and writes it to `.tgcloud/credentials`, which
is git-ignored. `login` needs an interactive terminal; from a non-interactive
shell, export `TGCLOUD_TOKEN` instead. `npx tgcloud status` confirms the link.

### 3. Configure administrators

Administrators are configured by **numeric Telegram user ID** in
`tgcloud/lib/config.js`:

```js
export const ADMIN_IDS = [123456789];
```

1. Deploy the code first (step 5), or read your id from any user-info bot — the
   bot's own `/id` command prints it once it is running.
2. Put the number(s) in the array. Nothing else is needed: no password, no
   environment variable, no secret. A Telegram ID is a public number, and
   usernames are never trusted because users can change them.
3. Deploy again, then send `/admin`. If the panel opens, authorisation works.

`ADMIN_IDS = []` is the safe default: the bot serves everyone and nobody can
moderate.

### 4. Apply the database migration

```bash
npm run migrate -- --dry-run   # review what would change
npm run migrate                # apply it
```

Migrations are **separate from code deploys**: `npm run deploy` uploads
`schema.js` and reports pending changes but never applies them. The interactive
`migrate` asks `[y/N]` per change; `--yes` accepts everything, `--safe` only the
changes it considers safe. Nothing in the bot creates, seeds or resets a table at
request time.

### 5. Deploy

```bash
npm run deploy      # npx tgcloud push
```

Pushes only the changed modules under `tgcloud/`. `npm run status` and
`npm run diff` show local vs. deployed state offline.

### 6. Seed the catalog and test

Send `/seed` to the bot **from an administrator account**, then `/products`.
`/seed` is idempotent: running it twice adds nothing.

Run a handler against the deployed code without touching a phone:

```bash
npx tgcloud run handlers/message '{"message_id":1,"chat":{"id":123},"from":{"id":123},"text":"/start"}'
```

---

## Commands

### Everyone

| Command | What it does |
| --- | --- |
| `/start` | Welcome, and registers the user |
| `/help` | Commands, reporting syntax, data rules |
| `/about` | What the bot is and what it does not do |
| `/id` | Your numeric Telegram ID (for `ADMIN_IDS`) |
| `/products [page]` | Browse the catalog; each product is a button |
| `/search <query>` | Search; plain text without a command searches too |
| `/price <product_id>` | Published prices for one product (alias: `/product`) |
| `/report <id> \| <price> \| <store> \| [url]` | Submit a price |
| `/flag <report_id>` | Flag a published report as suspicious |

### Administrators

| Command | What it does |
| --- | --- |
| `/admin` | Counts and the command list |
| `/pending` | Moderation queue, oldest first, with approve/reject buttons |
| `/inspect <report_id>` | One report in full: price, store, date, source, flags, outlier hint |
| `/approve <report_id>` | Publish a pending report |
| `/reject <report_id> [reason]` | Reject it, optionally with a note |
| `/seed` | Load/refresh the catalog (idempotent) |

### Buttons

| Button | Callback data | Does |
| --- | --- | --- |
| a product name | `product:<id>` | opens its price page |
| « / » | `catalog:page:<n>` | pages the catalog |
| 🚩 | `flag:<report_id>` | flags that report |
| ✅ / 🗑 | `mod:approve:<id>` / `mod:reject:<id>` | decides a pending report (**administrators only**) |
| « صف بررسی | `mod:queue:0` | reopens the queue (**administrators only**) |
| 📖 / ℹ️ | `menu:help` / `menu:about` | swaps the menu text |

Every press is re-validated: the shape of the payload, the existence of the
row, the state transition, and — for moderation — that the presser is in
`ADMIN_IDS`. A forged `mod:approve:1` from a normal account changes nothing.

---

## Price reporting

```
/report 5 | 4,850,000 | دیجی‌کالا | https://shop.example/p/12
```

| Rule | Behaviour |
| --- | --- |
| Currency | **Toman only.** A rial amount is rejected, never converted. Every message says تومان. |
| Format | Whole toman; `4,850,000`, `۴٬۸۵۰٬۰۰۰`, `1.250.000`, `۱.۵ میلیون`, `۲ میلیون و ۳۰۰ هزار` all work. Decimals without a multiplier (`1250.5`), negatives, unsafe integers and text are refused. |
| Bounds | 1,000 … 100,000,000 toman (`PRICE_LIMITS`). |
| Product | Must exist and be active; ids appear as `#N` in `/products` and `/search`. |
| Store | Required, 1–60 characters, stored as typed; a folded key is used only for duplicate detection. |
| Source URL | Optional, `http(s)`, ≤ 200 characters. **Never fetched.** |
| Duplicate | Same person + product + price + store within 24 h is refused. |
| Rate limit | 5 reports / 24 h per user, enforced in SQL. |

A new report is always **pending**. The confirmation says so and says the number
is not counted anywhere until a moderator approves it.

### How moderation works

A report moves `pending → approved` or `pending → rejected`, once, from `/pending`,
`/inspect`, or the buttons under those messages. The decision is a single guarded
statement:

```sql
UPDATE price_reports SET status = ?, reviewed_at = unixepoch(), reviewed_by = ?
WHERE id = ? AND status = 'pending' RETURNING id, status, reviewed_at
```

so a repeated command, a stale button, or two moderators pressing at the same
moment cannot decide the same report twice.

### How to read a price page

- **Median** appears only with **3+ distinct contributors**; below that the page
  says how many people are missing instead of inventing a number.
- **Range** appears with 2+ contributors.
- **Pending** reports are counted separately and never enter the numbers.
- **Rejected** reports are never shown.
- **Stale** data (newest approved report older than 30 days) is flagged as such.
- No confidence percentage, no "verified" badge, no claim that a shop has stock.

---

## Database

| Table | Purpose |
| --- | --- |
| `users` | One row per Telegram account: `tg_id` (UNIQUE, the identity), first name. No username, phone or email. |
| `products` | Catalog: name, **UNIQUE** normalized name, category, keywords, active flag. |
| `price_reports` | product, user, integer toman, store name + folded store key, source URL, status, review metadata. |
| `report_flags` | report, user, timestamp — **UNIQUE** per (report, user). |

Indexes exist only for real access patterns: `(product_id, status, created_at)`,
`(user_id, created_at)`, `(status, created_at)`.

There are **no foreign keys** — the platform runs SQLite with them off and the
schema DSL rejects them. `product_id`, `user_id` and `report_id` are validated in
application code on every write.

---

## Limitations

- **No paid price API.** The bot has no source of market data other than people.
- **No scraping.** It never fetches a shop page; a submitted URL is supporting
  information a moderator may look at, never proof of a price.
- **User reports can be outdated or wrong.** That is why they are moderated, why
  a median needs several people, and why age is always shown.
- **Availability is never guaranteed.** A price means "someone reported paying
  this", not "you can buy it at this price now".
- **A URL does not verify anything.** Neither does a high number of reports:
  nothing here is called verified, only approved what a moderator passed.
- **Duplicate detection has a narrow race.** Two identical submissions arriving
  in the same instant can both pass the read-then-insert duplicate check (SQLite
  has no window predicate to make it atomic). The per-user rate limit still caps
  the damage at 5 reports per day, and a duplicate is visible in `/pending`.
- **The runtime is not stock Node.** `tgcloud run` is the only way to execute a
  handler against the platform; local tests use a double (below).

---

## Tests

```bash
npm test        # 122 tests, node:test only — no framework
npm run check   # parse every deployed module + resolve every import
```

Two layers:

1. **Pure modules** (normalization, toman parsing, search ranking, statistics,
   Jalali dates, `/report` parsing, callback-data parsing) are tested directly.
2. **Database and handler behaviour** runs against **real SQLite**
   (`node:sqlite`) through `tests/support/sdk.mjs`, a double of the platform SDK
   whose tables are generated from `tgcloud/schema.js` itself. A missing UNIQUE
   index or CHECK constraint therefore fails a test: remove the flag index from
   the schema and three tests fail.

What the suite covers: normalization, price validation (including rial, decimals
and unsafe integers), search, duplicate submissions, the rate limit, summaries
(median rules, contributors, staleness, rejected/pending exclusion), moderation
transitions, admin authorisation, duplicate and self-flags, every command's happy
and error paths, callback validation (malformed, oversized, forged, stale),
unauthorised moderation, and database failures.

**What the tests do not prove:** that Telegram delivers these messages. The suite
calls the handlers directly with Bot API payloads and records the calls; nothing
was sent to a real chat. Delivery needs the manual checklist below.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `npm run migrate` says `no such table` or reports nothing to do | Run it after `npm run deploy` (the platform needs the uploaded `schema.js`), and check you are logged in with `npx tgcloud status`. |
| The bot answers "فهرست کالاها هنوز آماده نیست" | The catalog was never seeded. Send `/seed` as an administrator. |
| `/seed` replies with the migration line | The tables do not exist yet: `npm run migrate`. |
| `/admin` says «این دستور در دسترس شما نیست» | Your Telegram ID is not in `ADMIN_IDS`, or you edited it without `npm run deploy`. Check `/id`, then redeploy. |
| Buttons do nothing | Usually a stale message (older than 48 h) or an older deployment. The bot answers taps with a short toast; if there is no toast, check `npx tgcloud status` and redeploy. |
| A button edit fails with "message is not modified" | Not an error: the screen already says exactly that. The bot detects it and sends nothing. |
| Prices show "برای نمایش میانه دست‌کم ۳ نفر…" | Working as intended: fewer than 3 distinct contributors. |
| `npm test` fails with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` | Local Node is older than 22.5, which the *tests* need. The deployed bot does not use `node:sqlite`. |
| Everything throws `ERR_MODULE_NOT_FOUND: sdk` locally | Expected: `sdk` only exists inside the platform. Use `npx tgcloud run` or the test double. |
| A migration would drop data | Stop. `migrate` prompts per change; use `--dry-run` first. Never run with `--yes` on a database you care about. |

Logs: handler failures go to `console.error` with the error code/description and
never the user's message text. `npx tgcloud run` shows them locally; the platform
dashboard shows them for deployed code.

---

## Manual Telegram testing checklist

After deploying and migrating, in a real Telegram client:

1. `/start` → welcome text with three menu buttons; the 📦 button opens the catalog.
2. `/products` → six products, each a button; « بعدی » pages forward, « قبلی » back.
3. Tap a product → its price page opens *in place*; « فهرست کالاها » returns.
4. `/search آيفون` and `/search آیفون` → identical results; plain `شارژر` also searches.
5. `/price 1` and `/product 1` → the same page.
6. `/report 1 | 4,850,000 | دیجی‌کالا` → confirmation says **در انتظار بررسی**.
7. Repeat the same line → duplicate refusal.
8. `/report 1 | 48500000 ریال | دیجی‌کالا` → rial is refused (no conversion).
9. `/report 1 | 4,850,000.5 | دیجی‌کالا` → decimal refused.
10. Submit 5 different prices, then a 6th → rate-limit message.
11. `/product 1` → the pending report is counted but not priced.
12. From a second account: `/flag 1` → «فقط گزارش‌های تأییدشده…»; then, after approval,
    `/flag <report_id>` twice → second press says you already flagged it.
13. From a non-admin account: `/pending`, `/approve 1`, and a forged
    `mod:approve:1` (not possible from the UI, but `/approve` is) → refused, data unchanged.
14. From the admin account: `/pending` → queue with ✅/🗑 buttons; approve one.
15. `/product 1` → the approved price appears; with 3 contributors a median appears.
16. `/inspect <id>` → price, store, Jalali date, source, flags; **no** reporter name.
17. Reject the rest with `/reject <id> دلیل` → they vanish from `/product 1`.
18. Wait 48 h (or use an old message) and press a stale button → a toast, no crash.
19. Block the bot from a second account, then press a button → no crash in logs
    beyond a warning.
20. Check the platform logs for any `callback failed` / `message handling failed`
    lines that should not be there.

---

## Roadmap (not part of this MVP)

- "My reports" with their moderation state.
- A `/block` moderation tool if abuse ever justifies it.
- Notifying administrators when a report collects several flags.
