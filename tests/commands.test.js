// The command surface: every public and administrative command, and the ways
// they are asked for wrongly. Runs the real router against the SQLite double.

import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { createTestApp, lastText, message, restoreSchema } from './support/app.mjs';

let app;
let config;

const ADMIN = 9001;
const USER = 1001;

beforeEach(async () => {
  app = await createTestApp();
  config = await import('../tgcloud/lib/config.js');
  config.ADMIN_IDS.length = 0;
  config.ADMIN_IDS.push(ADMIN);
  await app.catalog.seedCatalog();
});

const send = (text, fromId = USER) => app.message(message(fromId, fromId, text));

test('/start welcomes the user, registers them, and offers the menu', async () => {
  await send('/start');

  assert.match(lastText(), /چی‌ارزه/);
  const rows = app.calls.at(-1)[1].reply_markup.inline_keyboard;
  assert.equal(rows.length >= 2, true);

  const users = app.database.prepare('SELECT tg_id FROM users').all();
  assert.deepEqual(users.map((row) => row.tg_id), [USER]);
});

test('/start still answers when the database is unreachable', async () => {
  app.database.exec('DROP TABLE users');
  try {
    await send('/start');
    assert.match(lastText(), /چی‌ارزه/);
  } finally {
    restoreSchema();
  }
});

test('/help, /about and /id answer with their own screens', async () => {
  await send('/help');
  assert.match(lastText(), /راهنما/);

  await send('/about');
  assert.match(lastText(), /دربارهٔ چی‌ارزه/);

  await send('/id');
  // Latin digits: this value is meant to be pasted into ADMIN_IDS.
  assert.match(lastText(), new RegExp(`<code>${USER}</code>`));
});

test('/id tells an administrator that they are one', async () => {
  await send('/id', ADMIN);
  assert.match(lastText(), /مدیر/);
});

test('/products pages through the catalog and clamps out-of-range pages', async () => {
  await send('/products');
  assert.match(lastText(), /صفحهٔ ۱ از ۷/);

  await send('/products 2');
  assert.match(lastText(), /صفحهٔ ۲ از ۷/);

  await send('/products 999');
  assert.match(lastText(), /صفحهٔ ۷ از ۷/);

  await send('/products abc');
  assert.match(lastText(), /صفحهٔ ۱ از ۷/);
});

test('/search needs a query, refuses an over-long one, and finds nothing honestly', async () => {
  await send('/search');
  assert.match(lastText(), /عبارت جست‌وجو را بنویسید/);

  await send(`/search ${'ش'.repeat(80)}`);
  assert.match(lastText(), /خیلی بلند است/);

  await send('/search یخچال');
  assert.match(lastText(), /چیزی پیدا نشد/);
});

test('plain text is a search; anything that is not text says so', async () => {
  await send('شارژر');
  assert.match(lastText(), /نتایج «شارژر»/);

  await app.message({ message_id: 2, chat: { id: USER, type: 'private' }, from: { id: USER } });
  assert.match(lastText(), /فقط پیام متنی/);
});

test('a bare "/" is an empty command, not a search for a slash', async () => {
  await send('/');
  assert.match(lastText(), /راهنما/);
});

test('an unknown command names itself and offers the help', async () => {
  await send('/nonsense');
  assert.match(lastText(), /nonsense/);
  assert.match(lastText(), /\/help/);
});

test('commands work when addressed to the bot (@BotName)', async () => {
  await send('/help@ChiArzehBot');
  assert.match(lastText(), /راهنما/);
});

test('/price and /product are the same page', async () => {
  const report = await app.reports.submitReport(
    { id: USER, first_name: 'کاربر' },
    { productId: 1, priceToman: 4_850_000, storeName: 'دیجی‌کالا', sourceUrl: null },
  );
  await app.moderation.approveReport(report.report.id, ADMIN);

  await send('/price 1');
  const viaPrice = lastText();
  await send('/product 1');

  assert.equal(viaPrice, lastText());
  assert.match(viaPrice, /۴٬۸۵۰٬۰۰۰ تومان/);
});

test('/product without a usable id explains what it needs', async () => {
  await send('/product');
  assert.match(lastText(), /شمارهٔ کالا/);

  await send('/product abc');
  assert.match(lastText(), /شمارهٔ کالا/);

  await send('/product 9999');
  assert.match(lastText(), /کالایی با این شناسه پیدا نشد/);
});

test('/report explains the format when it is missing pieces', async () => {
  await send('/report');
  assert.match(lastText(), /قالب|ثبت گزارش/);

  await send('/report 1');
  assert.match(lastText(), /قالب|ثبت گزارش/);

  await send('/report 1 | 1250000');
  assert.match(lastText(), /قالب|ثبت گزارش/);

  await send('/report 1 | 1250000 | فروشگاه | https://a.example | extra');
  assert.match(lastText(), /بخش‌های گزارش زیاد است/);
});

test('/flag without an id, and /flag for a missing report', async () => {
  await send('/flag');
  assert.match(lastText(), /شمارهٔ گزارش را مشخص کنید/);

  await send('/flag 9999');
  assert.match(lastText(), /گزارشی با این شماره پیدا نشد/);
});

test('/flag on a published report from another user works from the command too', async () => {
  const report = await app.reports.submitReport(
    { id: 1002, first_name: 'دیگری' },
    { productId: 1, priceToman: 4_850_000, storeName: 'دیجی‌کالا', sourceUrl: null },
  );
  await app.moderation.approveReport(report.report.id, ADMIN);

  await send(`/flag ${report.report.id}`);
  assert.match(lastText(), /علامت زده شد/);
  assert.equal(await app.moderation.countFlags(report.report.id), 1);
});

test('administrator commands answer for administrators', async () => {
  await send('/admin', ADMIN);
  assert.match(lastText(), /مدیریت/);

  await send('/pending', ADMIN);
  assert.match(lastText(), /صف بررسی/);

  await send('/seed', ADMIN);
  assert.match(lastText(), /از قبل کامل بود|به‌روز شد/);
});

test('administrator commands stay closed to everyone else', async () => {
  for (const command of ['/admin', '/pending', '/inspect 1', '/approve 1', '/reject 1', '/seed']) {
    await send(command);
    assert.match(lastText(), /در دسترس شما نیست/, command);
  }
});

test('/inspect and /approve need a usable id', async () => {
  await send('/inspect', ADMIN);
  assert.match(lastText(), /پیدا نشد/);

  await send('/approve', ADMIN);
  assert.match(lastText(), /شمارهٔ گزارش را مشخص کنید/);

  await send('/reject', ADMIN);
  assert.match(lastText(), /شمارهٔ گزارش را مشخص کنید/);
});

test('seeding twice adds nothing the second time', async () => {
  await send('/seed', ADMIN);
  const first = lastText();
  await send('/seed', ADMIN);

  assert.match(first, /از قبل کامل بود/);
  assert.match(lastText(), /از قبل کامل بود/);
  assert.equal(app.database.prepare('SELECT COUNT(*) AS n FROM products').get().n, 38);
});

test('a database failure becomes one Persian sentence, not a stack trace', async () => {
  app.database.exec('DROP TABLE products');
  try {
    await send('/products');
    assert.match(lastText(), /مشکلی پیش آمد/);
    assert.doesNotMatch(lastText(), /SQLITE|Error|at /);
  } finally {
    restoreSchema();
  }
});

test('a message with no chat id is ignored instead of throwing', async () => {
  await app.message({ message_id: 5, from: { id: USER }, text: '/start' });
  // Nothing sent, nothing thrown — the invocation still resolves.
  assert.equal(app.calls.length, 0);
});
