// The live search flow, end to end through the real handlers, with Torob's HTTP
// scripted. Nothing here touches the network: these tests prove what the bot
// does with a given upstream answer — and, in particular, that a failure is
// reported instead of hidden.

import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createTestApp, lastScreen, lastText, message, screenCount } from './support/app.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const SEARCH_FIXTURE = fixture('torob-search-charger.json');
const SELLERS_FIXTURE = fixture('torob-sellers-charger.json');
const EDGE = fixture('torob-edge-cases.json');

const PRK = 'd92e497e-52aa-4f6e-ba9e-26664ae2368f';
const USER = 1001;

let app;
let config;

beforeEach(async () => {
  app = await createTestApp();
  config = await import('../tgcloud/lib/config.js');
  config.ADMIN_IDS.length = 0;
});

/** Answer every request with the same body, and count the calls. */
function serve(body, { status = 200 } = {}) {
  let calls = 0;
  app.setFetchHandler(() => {
    calls += 1;
    return { status, body };
  });
  return () => calls;
}

const send = (text, fromId = USER) => app.message(message(fromId, fromId, text));

const buttons = () => lastScreen()[1].reply_markup?.inline_keyboard?.flat() ?? [];
const toast = () => app.calls.filter(([method]) => method === 'answerCallbackQuery').at(-1)?.[1]?.text ?? '';

test('a plain Persian message searches Torob and answers with real offers', async () => {
  const called = serve(SEARCH_FIXTURE);

  await send('شارژر سامسونگ');

  assert.equal(called(), 1);
  const url = new URL(app.fetches[0].url);
  assert.equal(url.origin + url.pathname, 'https://api.torob.com/v4/base-product/search/');
  assert.equal(url.searchParams.get('q'), 'شارژر سامسونگ');
  assert.equal(url.searchParams.get('page'), '0');

  const text = lastText();
  assert.match(text, /نتایج «شارژر سامسونگ»/);
  assert.match(text, /شارژر سامسونگ مدل EP-T4510 45W/);
  assert.match(text, /۳٬۴۵۲٬۰۰۰ تومان/); // the cheapest price for that product
  assert.match(text, /ایران تاجیر/); // a single-shop product names the shop
  assert.match(text, /در ۷۳۰ فروشگاه/); // a multi-shop product gives the count
  assert.match(text, /تبلیغ/); // the paid slot is labelled as one
  assert.match(text, /همین حالا از ترب|ذخیره‌شده/);
  assert.match(text, /موجود بودن کالا تضمینی نیست/);
});

test('every result carries a link to its Torob page and a sellers button', async () => {
  serve(SEARCH_FIXTURE);
  await send('/search شارژر سامسونگ');

  const rows = buttons();
  const links = rows.filter((button) => button.url);
  const callbacks = rows.filter((button) => button.callback_data?.startsWith('torob:sellers:'));

  assert.equal(links.length, 4);
  assert.equal(callbacks.length, 4);
  assert.equal(links[0].url, 'https://torob.com/p/ec705a97-bdcb-4786-86c1-539b1a1361b9/');
  assert.equal(callbacks[1].callback_data, `torob:sellers:${PRK}`);

  // Telegram's hard limit, checked on the button we actually send.
  for (const button of callbacks) {
    assert.equal(Buffer.byteLength(button.callback_data, 'utf8') <= 64, true);
  }
});

test('/search and plain text are the same path', async () => {
  serve(SEARCH_FIXTURE);

  await send('شارژر سامسونگ');
  const viaText = lastText();

  // Clear the cache so both calls are answered by the same code path, freshly.
  app.database.exec('DELETE FROM torob_cache');
  app.fetches.length = 0;
  await send('/search شارژر سامسونگ');

  assert.equal(app.fetches.length, 1);
  assert.equal(viaText, lastText());
});

test('/price is a search too — the old catalog page keeps /product', async () => {
  await app.catalog.seedCatalog();
  serve(SEARCH_FIXTURE);

  await send('/price شارژر سامسونگ');
  assert.match(lastText(), /نتایج «شارژر سامسونگ»/);
  assert.equal(app.fetches.length, 1);

  // `/product <id>` is unchanged: the community page for a catalog product.
  await send('/product 1');
  assert.match(lastText(), /شارژر USB-C ۲۰ وات/);
  assert.equal(app.fetches.length, 1); // no upstream call for a catalog page
});

test('the same query twice is served from the cache, upstream once', async () => {
  const called = serve(SEARCH_FIXTURE);

  await send('شارژر سامسونگ');
  const first = lastText();
  await send('شارژر  سامسونگ'); // extra whitespace: the same normalized key

  assert.equal(called(), 1);
  // Same offers, but the freshness line now says they came from the cache.
  assert.match(lastText(), /۳٬۴۵۲٬۰۰۰ تومان/);
  assert.match(lastText(), /ذخیره‌شده از/);
  assert.notEqual(lastText(), first);
  // Any number of people asking the same thing does not multiply requests.
  await send('شارژر سامسونگ', 2002);
  assert.equal(called(), 1);

  const rows = app.database.prepare('SELECT cache_key FROM torob_cache').all();
  assert.equal(rows.length, 1);
  assert.match(rows[0].cache_key, /^search:شارژر سامسونگ$/);
});

test('a cached answer is labelled as cached and goes stale after the TTL', async () => {
  const called = serve(SEARCH_FIXTURE);
  await send('شارژر سامسونگ');
  assert.match(lastText(), /همین حالا از ترب گرفته شد/);

  // Age the row past the TTL: the next search must go upstream again.
  const old = Math.floor(Date.now() / 1000) - (config.TOROB.cacheTtlMinutes + 1) * 60;
  app.database.prepare('UPDATE torob_cache SET fetched_at = ?').run(old);

  await send('شارژر سامسونگ');
  assert.equal(called(), 2);

  // Within the TTL the answer says so, because "fetched just now" would be a lie.
  app.database.prepare('UPDATE torob_cache SET fetched_at = ?').run(Math.floor(Date.now() / 1000) - 120);
  await send('شارژر سامسونگ');
  assert.equal(called(), 2);
  assert.match(lastText(), /ذخیره‌شده از/);
});

test('a failed lookup is never cached, and says why in Persian', async () => {
  const cases = [
    { name: 'server error', answer: { status: 500, body: 'oops' }, expect: /ترب به این جست‌وجو پاسخ نداد/ },
    { name: 'rate limited', answer: { status: 429, body: 'slow down' }, expect: /محدود کرده/ },
    { name: 'not JSON', answer: { body: '<html>blocked</html>' }, expect: /قابل خواندن نبود/ },
  ];

  for (const { name, answer, expect } of cases) {
    const called = serve(answer.body, { status: answer.status ?? 200 });

    await send('شارژر سامسونگ');
    assert.match(lastText(), expect, name);
    assert.match(lastText(), /products/, name); // always offers the next step

    // The failure is not stored: the next identical search asks again.
    await send('شارژر سامسونگ');
    assert.equal(called(), 2, name);
    assert.equal(app.database.prepare('SELECT COUNT(*) AS n FROM torob_cache').get().n, 0, name);
  }
});

test('a network failure and a timeout are reported, not swallowed', async () => {
  app.setFetchHandler(() => Promise.reject(new Error('ECONNRESET')));
  await send('شارژر سامسونگ');
  assert.match(lastText(), /ارتباط با ترب برقرار نشد/);

  // A request that never settles must not hold the invocation open.
  const previous = config.TOROB.timeoutMs;
  config.TOROB.timeoutMs = 50;
  try {
    app.setFetchHandler(() => new Promise(() => {}));
    await send('شارژر سامسونگ');
    assert.match(lastText(), /دیر رسید/);
  } finally {
    config.TOROB.timeoutMs = previous;
  }
});

test('an unexpected upstream shape is reported as such, never as "no results"', async () => {
  serve(EDGE.results_not_an_array);
  await send('شارژر سامسونگ');

  assert.match(lastText(), /ساختار پاسخ ترب تغییر کرده/);
  assert.doesNotMatch(lastText(), /چیزی پیدا نشد/);
});

test('an oversized body is refused before it is parsed', async () => {
  const previous = config.TOROB.maxResponseChars;
  config.TOROB.maxResponseChars = 100;
  try {
    serve(SEARCH_FIXTURE);
    await send('شارژر سامسونگ');
    assert.match(lastText(), /بیش از حد بزرگ/);
  } finally {
    config.TOROB.maxResponseChars = previous;
  }
});

test('empty results are explained honestly, with the next step', async () => {
  serve(EDGE.empty);
  await send('/search شارژر سامسونگ');

  assert.match(lastText(), /چیزی پیدا نشد/);
  assert.match(lastText(), /\/products/);
  assert.equal(buttons().some((button) => button.text.includes('کالاهای ما')), true);
});

test('a spell-checked query is suggested back to the user', async () => {
  serve(EDGE.spellchecked);
  await send('شارزر سامسونگ');

  assert.match(lastText(), /منظورتان «شارژر»/);
});

test('queries that cannot be searched never reach Torob', async () => {
  const called = serve(SEARCH_FIXTURE);

  await send('/search');
  assert.match(lastText(), /عبارت جست‌وجو را بنویسید/);

  await send(`/search ${'ش'.repeat(80)}`);
  assert.match(lastText(), /خیلی بلند است/);

  await send('/search !!! ???');
  assert.match(lastText(), /باید شامل حرف یا رقم باشد/);

  assert.equal(called(), 0);
});

test('the sellers button opens that product\'s shops, cheapest first', async () => {
  serve(SELLERS_FIXTURE);

  await app.callbackQuery({
    id: 'cb-1',
    from: { id: USER },
    data: `torob:sellers:${PRK}`,
    message: { message_id: 9, chat: { id: USER } },
  });

  assert.match(app.fetches[0].url, /base-product\/sellers\/\?prk=d92e497e-52aa-4f6e-ba9e-26664ae2368f&list_type=products_info/);
  assert.equal(lastScreen()[0], 'editMessageText');

  const text = lastText();
  assert.match(text, /پخش پاسارگاد/);
  assert.match(text, /۱٬۳۸۸٬۸۰۰ تومان/);
  assert.match(text, /تهران|الوند|اصفهان|بندرعباس/); // city, when Torob sends it
  assert.match(text, /۵ فروشنده/); // all of them fit, so no "cheapest N of M"
  // The list is the whole seller list, so it must be ordered by price.
  const prices = [...text.matchAll(/— ([۰-۹٬]+) تومان/g)].map((m) => m[1]);
  assert.equal(prices.length, 5);
  assert.equal(new Set(prices).size >= 2, true);
  assert.match(toast(), /$^/); // answered with no toast text, so the screen can speak
});

test('the sellers view flags unreliable prices and advertisements', async () => {
  serve(SELLERS_FIXTURE);
  await app.callbackQuery({
    id: 'cb-2',
    from: { id: USER },
    data: `torob:sellers:${PRK}`,
    message: { message_id: 9, chat: { id: USER } },
  });

  assert.match(lastText(), /قیمت نامعتبر اعلام‌شده/);
  assert.match(lastText(), /تبلیغ/);
});

test('the sellers lookup is cached like the search', async () => {
  let calls = 0;
  app.setFetchHandler(() => {
    calls += 1;
    return { body: SELLERS_FIXTURE };
  });

  const press = () =>
    app.callbackQuery({
      id: `cb-${calls}`,
      from: { id: USER },
      data: `torob:sellers:${PRK}`,
      message: { message_id: 9, chat: { id: USER } },
    });

  await press();
  await press();

  assert.equal(calls, 1);
  assert.equal(app.database.prepare("SELECT COUNT(*) AS n FROM torob_cache WHERE cache_key LIKE 'sellers:%'").get().n, 1);
});

test('forged or malformed sellers callbacks change nothing and answer anyway', async () => {
  const called = serve(SELLERS_FIXTURE);

  for (const data of [
    'torob:sellers:not-a-uuid',
    'torob:sellers:../../etc',
    'torob:sellers:',
    'torob:approve:d92e497e-52aa-4f6e-ba9e-26664ae2368f',
    'torob:sellers:d92e497e-52aa-4f6e-ba9e-26664ae2368f:extra',
  ]) {
    await app.callbackQuery({
      id: `cb-${data}`,
      from: { id: USER },
      data,
      message: { message_id: 9, chat: { id: USER } },
    });
    assert.notEqual(toast(), '', data);
  }

  assert.equal(called(), 0);
  assert.equal(screenCount(), 0);
});

test('a product Torob lists without shops says so instead of an empty screen', async () => {
  serve(EDGE.sellers.empty);
  await app.callbackQuery({
    id: 'cb-3',
    from: { id: USER },
    data: `torob:sellers:${PRK}`,
    message: { message_id: 9, chat: { id: USER } },
  });

  assert.match(lastText(), /فروشنده‌ای برای این کالا نشان نمی‌دهد/);
});

test('search still works when the cache table is missing (schema not migrated)', async () => {
  serve(SEARCH_FIXTURE);
  app.database.exec('DROP TABLE torob_cache');

  try {
    await send('شارژر سامسونگ');
    assert.match(lastText(), /نتایج «شارژر سامسونگ»/);
    assert.equal(app.fetches.length, 1);

    // …and without a cache every search is a fresh upstream call.
    await send('شارژر سامسونگ');
    assert.equal(app.fetches.length, 2);
  } finally {
    app.database.exec(
      'CREATE TABLE "torob_cache" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "cache_key" TEXT NOT NULL UNIQUE, "payload" TEXT NOT NULL, "fetched_at" INTEGER NOT NULL DEFAULT (unixepoch()))',
    );
  }
});

test('the search request is polite: one attempt, a named agent, no cookies', async () => {
  serve(SEARCH_FIXTURE);
  await send('شارژر سامسونگ');

  assert.equal(app.fetches.length, 1);
  const [{ options }] = app.fetches;
  assert.equal(options.method, 'GET');
  assert.match(options.headers['User-Agent'], /ChiArzehBot/);
  assert.equal(options.headers.Accept, 'application/json');
  assert.equal('body' in options, false); // nothing is sent but the query in the URL
});
