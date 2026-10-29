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
├─ schema.js              # database tables (price reports, flags)
├─ handlers/
│  ├─ message.js          # commands and text messages
│  └─ callback_query.js   # inline keyboard presses
└─ lib/
   ├─ catalog.js          # the predefined product catalog + search
   ├─ config.js           # admin IDs, price/text limits
   ├─ input.js            # normalization, price parsing, validation
   ├─ format.js           # Persian digits, toman, relative time
   ├─ text.js             # every user-facing Persian string
   ├─ keyboards.js        # inline keyboards and callback data
   └─ telegram.js         # HTML send/edit/answer helpers
tests/                    # offline unit tests for the pure modules
scripts/check.js          # offline parse + import-graph check
docs/tgcloud-sdk.md       # platform SDK reference
AGENTS.md                 # orientation for AI coding assistants
```

Only `.js` files under `tgcloud/` are deployed. `tests/`, `scripts/` and every
Markdown file stay local.

## Getting started

```bash
npm install

# Link the project to a bot:
# @BotFather → your bot → Serverless → CLI Access → Access token
npx tgcloud login

# Deploy the code, then apply the database schema:
npm run deploy          # tgcloud push
npm run migrate         # tgcloud migrate
```

Then open the bot and send `/start`.

### Become an administrator

Moderation is limited to the Telegram user IDs listed in
`tgcloud/lib/config.js`:

```js
export const ADMIN_IDS = [123456789];
```

Not sure of your numeric ID? Send `/id` to the bot, then redeploy. Nothing here is
a secret — the bot token is managed by Telegram Serverless and never appears in
this repository.

## Commands

| Command | What it does |
| --- | --- |
| `npm run deploy` | Deploy changed modules (`tgcloud push`) |
| `npm run migrate` | Apply pending schema changes to the database |
| `npm run status` | Show local vs. deployed modules (offline) |
| `npm run diff` | Line-by-line diff against the last known deploy (offline) |
| `npm run run -- handlers/message '{ chat: { id: 1 }, text: "/start" }'` | Execute a handler on the platform using local files |
| `npm run check` | Parse every deployed module and verify its imports |
| `npm test` | Unit-test the pure modules |

Deploying and migrating are deliberately separate: `push` reports schema changes
but never applies them.

## Data model

- **Catalog** — curated in `lib/catalog.js`, not in the database. Each product has
  a permanent `key`; price reports store that key, so the catalog needs no seeding
  and can never dangle.
- **`price_reports`** — `product_key`, `user_id`, `price_toman` (whole toman,
  integer), optional store/city, `status` (`pending` · `approved` · `rejected`),
  and the reviewer's id, timestamp and note.
- **`report_flags`** — "this looks wrong" votes, one per user per report.

The platform runs SQLite with foreign keys **off**, so integrity is enforced in
application code: delete a report's flags before the report, and resolve
`product_key` through `getProduct()`.

## Conventions

- Persian copy lives only in `lib/text.js`; messages are sent with
  `parse_mode: 'HTML'`, so user-supplied text goes through `escapeHtml`.
- Money is always an integer number of **toman** — never rial, floats or strings.
- Project modules are imported by relative path **with** `.js`; the platform SDK
  is imported by name.
- Callback data is namespaced `<area>:<action>` and stays under 64 bytes.

## Roadmap

1. Browse and search the catalog from the bot.
2. A product page: recent approved reports, how fresh they are, how much they agree.
3. Submit a price report with validation and a confirmation step.
4. "My reports", including pending and rejected ones with the reviewer's note.
5. Flag a suspicious report.
6. Administrator moderation queue: approve, reject with a reason, resolve flags.
