// Inline keyboard flows, driven through the real callback handler.
//
// These are handler-level tests against the SQLite double: they prove what the
// code decides, not what Telegram delivers. Delivery needs a deployed bot and a
// human finger (see README → "Manual Telegram testing checklist").

import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { botApiError, failNext } from './support/sdk.mjs';
import {
  createTestApp,
  lastMethod,
  lastScreen,
  lastText,
  message,
  restoreSchema,
  screenCount,
} from './support/app.mjs';

let app;
let config;

const ADMIN = 9001;
const REPORTER = 1001;
const VIEWER = 1002;

beforeEach(async () => {
  app = await createTestApp();
  config = await import('../tgcloud/lib/config.js');
  config.ADMIN_IDS.length = 0;
  config.ADMIN_IDS.push(ADMIN);
  await app.catalog.seedCatalog();
});

/** A callback press, as Telegram sends it. */
function press(data, fromId, messageId = 10) {
  return {
    id: `cb-${Math.random().toString(36).slice(2)}`,
    from: { id: fromId, first_name: 'کاربر' },
    data,
    message: { message_id: messageId, chat: { id: fromId, type: 'private' } },
  };
}

/** The last answerCallbackQuery payload. */
function lastAnswer() {
  return [...app.calls].reverse().find(([name]) => name === 'answerCallbackQuery')?.[1] ?? null;
}

async function pendingReport({ price = 4_850_000, store = 'دیجی‌کالا', from = REPORTER } = {}) {
  const result = await app.reports.submitReport(
    { id: from, first_name: 'کاربر' },
    { productId: 1, priceToman: price, storeName: store, sourceUrl: null },
  );
  assert.equal(result.ok, true);
  return result.report;
}

const statusOf = (id) =>
  app.database.prepare('SELECT status FROM price_reports WHERE id = ?').get(id)?.status;

test('the catalog offers one button per product, and pressing one opens its price page', async () => {
  await app.message(message(VIEWER, VIEWER, '/products'));
  const sent = app.calls.at(-1);
  assert.equal(sent[0], 'sendMessage');

  const buttons = sent[1].reply_markup.inline_keyboard.flat();
  assert.equal(buttons.length >= 6, true);
  assert.match(buttons[0].callback_data, /^product:\d+$/);

  const [productId] = buttons[0].callback_data.split(':').slice(1);
  await app.callbackQuery(press(buttons[0].callback_data, VIEWER));

  assert.equal(lastMethod(), 'editMessageText');
  assert.match(lastText(), /هنوز قیمت تأییدشده‌ای/);
  assert.equal(lastAnswer() !== null, true);
  assert.equal(productId.length > 0, true);
});

test('a price page offers flag buttons only for the reports it shows', async () => {
  const approved = await pendingReport({ price: 1_000_000, store: 'الف' });
  await app.moderation.approveReport(approved.id, ADMIN);
  const pending = await pendingReport({ price: 2_000_000, store: 'ب' });

  await app.callbackQuery(press(`product:${approved.productId}`, VIEWER));
  const keyboard = lastScreen()[1].reply_markup.inline_keyboard;

  const flagButtons = keyboard.flat().filter((button) => button.callback_data.startsWith('flag:'));
  assert.deepEqual(
    flagButtons.map((button) => button.callback_data),
    [`flag:${approved.id}`],
  );
  // The pending report is on the page as a count, never as a flaggable row.
  assert.equal(flagButtons.some((button) => button.callback_data === `flag:${pending.id}`), false);
});

test('flagging from a button tells the database and answers with a toast', async () => {
  const report = await pendingReport();
  await app.moderation.approveReport(report.id, ADMIN);

  await app.callbackQuery(press(`flag:${report.id}`, VIEWER));

  assert.equal(await app.moderation.countFlags(report.id), 1);
  assert.match(lastAnswer().text, /ثبت شد/);
  // A flag never redraws the screen and never changes the report's status.
  assert.equal(screenCount(), 0);
  assert.equal(statusOf(report.id), 'approved');
});

test('a second press on the same flag button is refused, politely', async () => {
  const report = await pendingReport();
  await app.moderation.approveReport(report.id, ADMIN);

  await app.callbackQuery(press(`flag:${report.id}`, VIEWER));
  await app.callbackQuery(press(`flag:${report.id}`, VIEWER));

  assert.equal(await app.moderation.countFlags(report.id), 1);
  assert.match(lastAnswer().text, /قبلاً/);
});

test('the author cannot flag their own report, even by forging the callback', async () => {
  const report = await pendingReport({ from: REPORTER });
  await app.moderation.approveReport(report.id, ADMIN);

  await app.callbackQuery(press(`flag:${report.id}`, REPORTER));

  assert.equal(await app.moderation.countFlags(report.id), 0);
  assert.match(lastAnswer().text, /خودتان/);
});

test('a pending report cannot be flagged from a crafted callback', async () => {
  const report = await pendingReport();
  await app.callbackQuery(press(`flag:${report.id}`, VIEWER));
  assert.equal(await app.moderation.countFlags(report.id), 0);
  assert.match(lastAnswer().text, /تأییدشده/);
});

test('unknown and malformed callback data are answered and change nothing', async () => {
  const report = await pendingReport();

  const bad = [
    '__proto__',
    'product:',
    'product:abc',
    'product:0',
    'product:-1',
    'product:1:2',
    'flag:999999',
    'mod:approve:abc',
    'mod:delete:1',
    'catalog:page:abc',
    `product:${'9'.repeat(80)}`,
    'menu:help:extra',
    '',
  ];

  for (const data of bad) {
    const before = app.calls.length;
    await app.callbackQuery(press(data, VIEWER));
    // Every press is answered, whatever it asked for.
    assert.equal(app.calls.length >= before + 1, true, data);
    assert.equal(lastAnswer() !== null, true, data);
  }

  assert.equal(statusOf(report.id), 'pending');
  assert.equal(app.database.prepare('SELECT COUNT(*) AS n FROM report_flags').get().n, 0);
});

test('a callback with no message (inline mode) is answered without touching the database', async () => {
  const before = app.calls.length;
  await app.callbackQuery({ id: 'cb-inline', from: { id: VIEWER }, data: 'product:1' });

  assert.equal(app.calls.length, before + 1);
  assert.equal(lastAnswer() !== null, true);
});

test('only administrators can approve from a button', async () => {
  const report = await pendingReport();

  // A normal user forging the moderator payload.
  await app.callbackQuery(press(`mod:approve:${report.id}`, VIEWER));

  assert.equal(statusOf(report.id), 'pending');
  assert.match(lastAnswer().text, /در دسترس شما نیست/);
  // Refused before anything was read or drawn.
  assert.equal(screenCount(), 0);

  await app.callbackQuery(press(`mod:approve:${report.id}`, ADMIN));
  assert.equal(statusOf(report.id), 'approved');
  assert.match(lastAnswer().text, /تأیید شد/);
});

test('an administrator can reject from a button, and the screen shows the result', async () => {
  const report = await pendingReport();

  await app.callbackQuery(press(`mod:reject:${report.id}`, ADMIN));

  assert.equal(statusOf(report.id), 'rejected');
  assert.match(lastAnswer().text, /رد شد/);
  assert.equal(lastMethod(), 'editMessageText');
  assert.match(lastText(), /ردشده/);

  // A published page can no longer show it.
  await app.message(message(VIEWER, VIEWER, `/product ${report.productId}`));
  assert.doesNotMatch(lastText(), /۴٬۸۵۰٬۰۰۰/);
});

test('pressing a stale moderation button twice cannot decide twice', async () => {
  const report = await pendingReport();

  await app.callbackQuery(press(`mod:approve:${report.id}`, ADMIN));
  await app.callbackQuery(press(`mod:reject:${report.id}`, ADMIN));

  assert.equal(statusOf(report.id), 'approved');
  assert.match(lastAnswer().text, /الان «تأییدشده» است/);
});

test('the queue button reopens the pending list for administrators only', async () => {
  await pendingReport();

  await app.callbackQuery(press('mod:queue:0', VIEWER));
  assert.match(lastAnswer().text, /در دسترس شما نیست/);

  await app.callbackQuery(press('mod:queue:0', ADMIN));
  assert.match(lastText(), /در انتظار بررسی/);
});

test('a stale button whose message was deleted sends a fresh message instead', async () => {
  failNext('editMessageText', botApiError(400, 'Bad Request: message to edit not found'));

  await app.callbackQuery(press('product:1', VIEWER));

  assert.equal(lastMethod(), 'sendMessage');
  assert.match(lastText(), /شارژر/);
});

test('"message is not modified" is not treated as an error', async () => {
  failNext('editMessageText', botApiError(400, 'Bad Request: message is not modified'));

  await app.callbackQuery(press('product:1', VIEWER));

  // No duplicate message is sent for a screen that already says this.
  assert.equal(screenCount(), 0);
});

test('a Bot API failure is reported in Persian and logged, not thrown at the user', async () => {
  failNext('editMessageText', botApiError(403, 'Forbidden: bot was blocked by the user'));

  await app.callbackQuery(press('product:1', VIEWER));

  assert.match(lastAnswer().text, /ممکن نشد/);
});

test('a database failure answers the press instead of hanging', async () => {
  app.database.exec('DROP TABLE price_reports');
  try {
    await app.callbackQuery(press('product:1', VIEWER));
    assert.match(lastAnswer().text, /ممکن نشد/);
  } finally {
    restoreSchema();
  }
});

test('the help and about buttons edit the message in place', async () => {
  await app.callbackQuery(press('menu:help', VIEWER));
  assert.equal(lastMethod(), 'editMessageText');
  assert.match(lastText(), /راهنما/);

  await app.callbackQuery(press('menu:about', VIEWER));
  assert.match(lastText(), /دربارهٔ چی‌ارزه؟/);
});

test('every keyboard the bot builds fits Telegram’s 64-byte callback limit', async () => {
  const report = await pendingReport();
  await app.moderation.approveReport(report.id, ADMIN);

  const screens = ['/products', '/search شارژر', `/product ${report.productId}`, '/help'];
  for (const command of screens) {
    await app.message(message(VIEWER, VIEWER, command));
  }
  for (const command of ['/pending', `/inspect ${report.id}`, '/admin']) {
    await app.message(message(ADMIN, ADMIN, command));
  }

  for (const [method, params] of app.calls) {
    if (method !== 'sendMessage' && method !== 'editMessageText') continue;
    for (const button of params.reply_markup?.inline_keyboard?.flat() ?? []) {
      const bytes = Buffer.byteLength(button.callback_data, 'utf8');
      assert.equal(bytes <= 64, true, `${button.callback_data} is ${bytes} bytes`);
      assert.equal(app.keyboards.parseCallbackData(button.callback_data) !== null, true, button.callback_data);
    }
  }
});
