// Runs the bot in a runtime whose host APIs match the Serverless isolate.
//
// Measured with `tgcloud run`, the isolate has no `URL`, `URLSearchParams`,
// `setTimeout` or `clearTimeout`. Node has all four, which is exactly why the
// original bug passed 160 local tests and failed on the first deployed message:
// the test environment was more capable than production.
//
// This script closes that gap. It boots the real app against real SQLite, then
// **deletes those four globals** and only afterwards dispatches the messages — so
// the code under test runs with the same capability set as the platform. The
// deletions happen after boot on purpose: the test harness itself (`node:module`,
// `node:sqlite`) legitimately uses them.
//
// The result is printed as one JSON line; `tests/runtime-limits.test.js` asserts
// on it. Run directly to see it: node tests/support/constrained-runtime.mjs

import { readFileSync } from 'node:fs';

import { createTestApp, lastText, message, screenCount } from './app.mjs';

// Read eagerly: the helper below must not touch `URL` after the deletions.
const SEARCH_FIXTURE = JSON.parse(
  readFileSync(new URL('../fixtures/torob-search-charger.json', import.meta.url), 'utf8'),
);

const app = await createTestApp();
app.setFetchHandler(() => ({ status: 200, body: SEARCH_FIXTURE }));
await app.catalog.seedCatalog();

// Everything the harness needs has loaded; now make the runtime as small as the
// platform's. Anything below this line that touches a deleted global throws.
delete globalThis.URLSearchParams;
delete globalThis.URL;
delete globalThis.setTimeout;
delete globalThis.clearTimeout;

const USER = 1001;
const send = (text) => app.message(message(USER, USER, text));

await send('شارژر سامسونگ');
const search = { text: lastText(), screens: screenCount(), fetches: app.fetches.map((f) => f.url) };

await send('/search شارژر سامسونگ');
const secondSearch = { text: lastText(), screens: screenCount() };

await send('/report 1 | 1000000 | دیجی‌کالا | https://Shop.Example/p/1');
const report = { text: lastText() };

process.stdout.write(
  `${JSON.stringify({
    deleted: {
      URL: typeof globalThis.URL,
      URLSearchParams: typeof globalThis.URLSearchParams,
      setTimeout: typeof globalThis.setTimeout,
      clearTimeout: typeof globalThis.clearTimeout,
    },
    search,
    secondSearch,
    report,
  })}\n`,
);
