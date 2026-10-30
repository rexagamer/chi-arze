# AGENTS.md

Orientation for AI coding assistants (and humans) working in this project.
This file is auto-loaded by Claude Code, Cursor, and similar tools — keep it short
and true. For the full SDK reference (db, Bot API, fetch), see
[docs/tgcloud-sdk.md](docs/tgcloud-sdk.md).

## What this project is

ChiArzeh (چی‌ارزه؟) — a **Persian Telegram bot** that answers a product name with
live prices from Torob, plus community-reported prices for a small curated
catalog, running on Telegram's serverless platform. You write
JavaScript modules (database schema, shared library code, update handlers); the
platform runs them in a V8 isolate. The `tgcloud` CLI syncs this local project
with the bot's cloud environment — think `wrangler`/`vercel` + `drizzle-kit`.

There is no server to run locally and no `node_modules` to import from at runtime:
the only things available inside a module are the platform SDK and other modules
in this project.

## Layout

Everything the platform runs lives in the **`tgcloud/`** folder. The rest of the
project root is yours (a mini-app front-end, config, docs).

| Path                  | What it is                                                        |
|-----------------------|-------------------------------------------------------------------|
| `tgcloud/schema.js`   | Database schema — tables as **named exports**. One file.          |
| `tgcloud/lib/`        | Shared modules. Subdirectories allowed (`lib/internal/util.js`).  |
| `tgcloud/handlers/`   | Update handlers, **one level only**. Names match Telegram Bot API update types (`message`, `callback_query`, …). |
| `tgcloud/endpoints/`  | Functions the Mini App calls (`POST /api/<name>`), **one level only**. |
| `tgcloud.jsonc`       | Project config. Its `"static"` block names the build folder hosted as the Mini App. |
| `docs/`               | Reference docs (this project's, for you). Not deployed.           |
| `.tgcloud/`           | CLI state (credentials, snapshot, cached layout). **Never edit or read from here** — it's gitignored machine state. |

Only `.js` files under `tgcloud/` (`schema.js`, `lib/`, `handlers/`, `endpoints/`) are deployed
as code, plus — when `tgcloud.jsonc` names one — the front-end's build folder as
the Mini App's static files. Everything else (Markdown, config, `.tgcloud/`, the
front-end's sources) is local-only. Module names are relative to `tgcloud/`: the
file `tgcloud/handlers/message.js` is the module `handlers/message`.

## Mini App front-end

If the project root holds a front-end (Vite, React, Vue, …), its **build output**
is deployed next to the bot and served as the Mini App at
`https://app<app_id>.tgcloud.ai/` — `push` prints the exact URL.

- `tgcloud.jsonc` → `{ "static": { "source": "dist" } }` — `source` names the
  build folder; the other keys of the `static` object are the serving config
  (e.g. `"spa": true` serves `index.html` for unknown extension-less paths —
  client-side routing; `immutable`, `headers`, `redirects`). `tgcloud init` writes
  the file when it recognizes the front-end; after that it's a normal project
  file. JSON with comments and trailing commas (a project may use a strict-JSON
  `tgcloud.json` instead — never both). `"static": "dist"` is accepted as a
  shorthand for `{ "source": "dist" }`.
  `"static": false` removes the deployed site on the next push.
- **Build before you push.** `push` uploads the folder as it is on disk; it never
  runs the build. `npm run deploy` (build + push) is the safe default.
- The front-end is ordinary browser code with npm packages — none of the
  `tgcloud/` module rules apply to it, and `tgcloud/` modules can't import it.
  It talks to the bot's code only through **endpoints** (below).
- The site is served from the host root, so the bundler's default `base` (`/`)
  is right. Don't add `X-Frame-Options` or a restrictive `frame-ancestors`:
  Telegram Web opens Mini Apps in an iframe.

## Endpoints — the Mini App's server side

`tgcloud/endpoints/<name>.js` is called by the Mini App as `POST /api/<name>` on
the same host as the static site. Use it for anything the front-end can't do
itself: the database, the Bot API, secrets.

- `export default async function (input, ctx)` — `input` is the JSON body (an
  object); the return value goes back as JSON.
- `ctx.initData` is the Mini App's init data **verified by the platform** (same
  shape as `Telegram.WebApp.initDataUnsafe`): `ctx.initData.user` is the caller.
  There is no `ctx.user`. Invalid init data → `401`, the endpoint never runs.
- Refuse with `throw new EndpointError('Out of stock', { code: 'OUT_OF_STOCK' })`
  (`import { EndpointError } from 'sdk'`) → `400`, the Mini App gets
  `description` + `parameters`. Any other exception → generic `500`; never
  rely on its message reaching the client.
- Front-end call: `Telegram.WebApp.Serverless.call('<name>', input, (err, result) => …)`
  from the official `telegram-web-app.js` — it sends the init data; `err` has
  `message` (description), `type` (`'ENDPOINT_ERROR'` for your `EndpointError`)
  and `parameters`. Don't hand-roll `fetch` + init data.
- Names: letters, digits, `_`, not starting with a digit (`getProfile`).
  Scaffold with `npx tgcloud add endpoints/<name>`; test with
  `npx tgcloud run endpoints/<name> '{}' --ctx '{ initData: { user: { id: 1 } } }'`.

## Module system — the rules that bite

- **Import project modules by relative path WITH the `.js` extension; import
  the SDK by name.** (from `tgcloud/handlers/message.js`:)
  - ✅ `import { users } from '../schema.js'`
  - ✅ `import { addItem } from '../lib/cart.js'`
  - ✅ `import { db, api, fetch } from 'sdk'` / `import { eq, sql } from 'sdk/db'`
  - ❌ `import { users } from '../schema'` → a relative import must end in `.js`
  - ❌ `import x from '../../src/x.js'` → nothing outside `tgcloud/` is reachable
  - A module's *name* is its path inside `tgcloud/` without `.js` (`lib/cart`);
    `tgcloud run` takes it, and `from 'lib/cart'` (no extension) also resolves —
    but write relative imports.
- **No filesystem, no npm packages** at runtime. Only `sdk` (and its submodules
  like `sdk/db`) and your own project modules exist.
- A handler module's `export default` is what the platform invokes, with the
  update's **payload** as the first argument — for `handlers/message` that's the
  `Message` (i.e. `update.message`), for `handlers/callback_query` the
  `CallbackQuery`, and so on. The full `Update` (with `update_id`) is on the
  second argument: `ctx.update`. An endpoint's `export default` gets
  `(input, ctx)` — see *Endpoints* above.

## Platform SDK (`import … from 'sdk'`)

- **`db`** — the database (query builder + schema DSL). Full API: [docs/tgcloud-sdk.md](docs/tgcloud-sdk.md).
- **`api`** — the Telegram Bot API. `api.<method>({...})` (e.g. `api.sendMessage`,
  `api.getMe`) returns the **unwrapped** result and **throws `BotApiError`** on
  failure (`import { BotApiError } from 'sdk'`; it has `.code`/`.description`/`.parameters`).
- **`fetch`** — outbound HTTP, web-`fetch`-like (`res.status/ok`, `res.json()`,
  `res.text()`, streaming via `for await`, redirects followed).
- **`EndpointError`** — the one way an endpoint refuses a call (see *Endpoints*).

## Database — the rules that bite

Full API in [docs/tgcloud-sdk.md](docs/tgcloud-sdk.md). The non-obvious parts:

- **Every DB call is async — always `await`.** `.all()`, `.get()`, `.values()`,
  `.run()`, `db.$count()` and the raw `db.run/all/get` all return Promises.
- **No foreign keys.** `.references()` and `foreignKey()` **throw at declaration**
  — the runtime runs with FKs off, so they'd be silently inert. Enforce integrity
  in application code (delete children before parents, etc.).
- **Drops happen only via `.deprecated('reason')`** on a column/table/index.
  Deleting the declaration does *not* drop anything.
- **Type changes aren't automatic** — do them by hand with `db.run(...)`.

## Deploy & migrate workflow

**Deploying never touches the database.** Schema sync is a separate, explicit step.

The CLI is a local dev-dependency, so run it with `npx tgcloud <command>` (or use
the `npm run` scripts in package.json — e.g. `npm run deploy`):

```
npx tgcloud status     # what changed locally vs the cloud
npx tgcloud push       # deploy modules (and the static build) to the cloud
npx tgcloud migrate    # apply tgcloud/schema.js changes to the database (interactive)
npx tgcloud run <module> [args]   # execute a handler or endpoint server-side
npx tgcloud pull       # bring the local project in line with the cloud
npx tgcloud login      # link this project to a bot
npx tgcloud webhook    # show the bot's webhook and whether it matches your handlers
```

After you change `tgcloud/schema.js`, `push` reports what the DB *would* change but applies
nothing — run `npx tgcloud migrate` to actually apply it.

The platform manages the bot's webhook for you, derived from your deployed
`handlers/*`, and refreshes it on `push`. If it ever drifts — e.g. someone called
`setWebhook` with the raw bot token — `npx tgcloud webhook` shows the mismatch and
`npx tgcloud webhook sync` repairs it.

## ChiArzeh conventions

Project-specific rules; read these before touching the bot.

- **Persian copy lives in `tgcloud/lib/text.js`.** Handlers never inline
  user-facing strings. Messages are sent with `parse_mode: 'HTML'`, so any
  user-supplied text goes through `escapeHtml` (`lib/format.js`) first.
- **Money is whole toman.** `price_reports.price_toman` is an integer. Parse input
  with `parseToman` + `parsePrice` and display with `formatToman`. Never store
  rial, floats or formatted strings, and never convert rial → toman.
- **Admin allowlist:** the Telegram IDs in `lib/config.js` (`isAdmin`). Commands
  are gated **once** in `handlers/message.js` (`ADMIN_COMMANDS`) before dispatch;
  button presses are gated independently in `handlers/callback_query.js`, because
  a callback can be forged and never passes through the router. Business functions
  in `lib/moderation.js` assume the caller is already authorised. Never authorise
  by username or first name, and never by anything carried in `callback_data`.
- **The primary path is live search, not the catalog.** A plain message or
  `/search` goes to Torob through `lib/torob.js` → `lib/torob-client.js`; the
  catalog is what `/catalog`, `/products`, `/product <id>` and price reports use.
  `/start` and `/help` must keep working without either.
- **Torob data and community data never mix in one answer.** A Torob result is
  labelled `از ترب` and carries its fetch time; a report is labelled as a user
  report. No Torob number is ever called verified, and no fetched price is ever
  written to `price_reports`.
- **The Torob endpoints are undocumented.** `torob-parse.js` is the only module
  that knows their shape; every field is treated as optional, an unexpected
  envelope returns `UNEXPECTED_SHAPE` instead of throwing, and a parser change
  belongs there, never in the handler. Never add an endpoint, parameter or field
  that has not been observed in a real response.
- **One upstream request per search, best effort.** `torob-client.js` is the only
  module that calls `fetch`; it sets a timeout (race, since the SDK documents no
  abort), caps the response size, and never retries. A cached answer is a
  different answer: the footer says «ذخیره‌شده از …». Failures are never cached.
- **Business rules live in `config.js`**: price bounds, duplicate window, rate
  limit, summary thresholds. Change behaviour there, not by hard-coding numbers.
- **Raw SQL vs. the query builder:** `catalog.js` uses the builder; `reports.js`,
  `moderation.js` and `users.js` use `sql` templates because they need aggregates,
  `RETURNING`, and single-statement guards (rate limit, status transitions).
  Raw rows are **not** type-converted — every read goes through a mapper
  (`toReport`) so timestamps stay `Date`s.
- **State machines are enforced by SQL, not by JS.** A decision is
  `UPDATE … WHERE id = ? AND status = 'pending'`; the rate limit is
  `INSERT … SELECT … WHERE count < limit`. Both are single statements so
  concurrent invocations cannot race past them.
- **One normalization, one place** (`lib/normalize.js`). Specifications must
  survive it: 20 W ≠ 25 W, 10,000 ≠ 20,000.
- **The catalog is a table, not code.** Seed with the admin `/seed` command only;
  it is idempotent because `products.normalized_name` is UNIQUE.
- **No foreign keys:** validate `product_id` with `getProductById()` and
  `report_id` with `getReportById()` before writing anything that references them.
- **Callbacks go through `lib/keyboards.js`.** Every button encodes
  `area:action[:arg]` (≤ 64 bytes) and `parseCallbackData` is the only parser:
  unknown areas, wrong arity, non-integer ids and oversized payloads return null.
  Parsing proves shape only — the handler still checks that the row exists, that
  the transition is allowed, and that the presser may do it. Never put secrets,
  names or free text in `callback_data`.
- **Buttons and copy are separate.** `views.js` decides which keyboard a screen
  gets; `text.js` decides what it says; a keyboard's button labels are display
  text and may be Persian, while `callback_data` stays ASCII.
- **Errors are handled once, at the top of each handler.** `handlers/message.js`
  and `handlers/callback_query.js` catch everything, log `code`/`description`
  (never the user's text) with `console.error`, and reply with one Persian
  sentence. A callback is *always* answered, even when it is refused, or the
  spinner never stops.
- **Offline checks:** `npm run check` (parse + imports) and `npm test`. Database
  logic is tested against real SQLite through the `sdk` double in
  `tests/support/`; the DDL is generated from `schema.js`, so schema edits are
  exercised automatically. Add a test there for any new rule; pure logic goes in
  a plain `tests/*.test.js`. Handler behaviour (commands, keyboards, callbacks) is
  tested through `tests/support/app.mjs`, which boots the router against a fresh
  in-memory database — no mocks of `reports.js` or `moderation.js`, so the tests
  exercise the real SQL.
- **No conversation state.** Nothing lives in a module-level variable; assume each
  update is a cold invocation. A multi-step flow would need a table with an
  explicit expiry — `/report` is one line precisely to avoid that.
- `tests/` and `scripts/` sit outside `tgcloud/`, so they are never deployed.
