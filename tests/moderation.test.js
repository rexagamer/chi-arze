// Moderation, flags and authorisation, against real SQLite.
// Authorisation itself is a handler concern, so several tests drive the bot with
// real `/approve` style messages and then check the database did not change.

import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { createTestApp, lastMethod, lastText, message } from './support/app.mjs';

let app;
let config;

const ADMIN_TG_ID = 9001;
const REPORTER = 1001;
const OTHER_USER = 1002;

beforeEach(async () => {
  app = await createTestApp();
  config = await import('../tgcloud/lib/config.js');
  config.ADMIN_IDS.length = 0;
  config.ADMIN_IDS.push(ADMIN_TG_ID);
  await app.catalog.seedCatalog();
});

/** A pending report written straight through the submission path. */
async function pendingReport({ productId = 1, price = 4_850_000, store = 'دیجی‌کالا', from = REPORTER } = {}) {
  const result = await app.reports.submitReport(
    { id: from, first_name: 'کاربر' },
    { productId, priceToman: price, storeName: store, sourceUrl: null },
  );
  assert.equal(result.ok, true);
  return result.report;
}

const statusOf = (id) =>
  app.database.prepare('SELECT status FROM price_reports WHERE id = ?').get(id)?.status;

test('an administrator approves a pending report and is recorded as the reviewer', async () => {
  const report = await pendingReport();

  await app.message(message(ADMIN_TG_ID, ADMIN_TG_ID, `/approve ${report.id}`));

  const row = app.database
    .prepare('SELECT status, reviewed_by, reviewed_at FROM price_reports WHERE id = ?')
    .get(report.id);

  assert.equal(row.status, 'approved');
  assert.equal(row.reviewed_by, ADMIN_TG_ID);
  assert.ok(row.reviewed_at > 0);
  assert.match(lastText(), /تأیید شد/);
});

test('an unauthorised user cannot approve or reject anything', async () => {
  const first = await pendingReport();
  const second = await pendingReport({ price: 4_900_000, store: 'ترب' });

  await app.message(message(OTHER_USER, OTHER_USER, `/approve ${first.id}`));
  assert.equal(statusOf(first.id), 'pending');
  assert.match(lastText(), /در دسترس شما نیست/);

  await app.message(message(OTHER_USER, OTHER_USER, `/reject ${second.id} نامعتبر`));
  assert.equal(statusOf(second.id), 'pending');

  // …and cannot read the queue either.
  await app.message(message(OTHER_USER, OTHER_USER, '/pending'));
  assert.match(lastText(), /در دسترس شما نیست/);
});

test('authorisation is by Telegram user id only, never by name', async () => {
  const report = await pendingReport();

  // A user whose first name looks like an administrator's, wrong id.
  await app.message(message(4242, 4242, `/approve ${report.id}`, { from: { first_name: 'admin' } }));
  assert.equal(statusOf(report.id), 'pending');

  // The real id, with an unrelated name, is authorised.
  await app.message(message(ADMIN_TG_ID, ADMIN_TG_ID, `/approve ${report.id}`, { from: { first_name: 'x' } }));
  assert.equal(statusOf(report.id), 'approved');
});

test('a report can only be decided once', async () => {
  const report = await pendingReport();
  assert.equal((await app.moderation.approveReport(report.id, ADMIN_TG_ID)).ok, true);

  const again = await app.moderation.approveReport(report.id, ADMIN_TG_ID);
  assert.equal(again.error, 'INVALID_STATE');
  assert.equal(again.status, 'approved');

  const rejectAfterApprove = await app.moderation.rejectReport(report.id, ADMIN_TG_ID, 'دیر شد');
  assert.equal(rejectAfterApprove.error, 'INVALID_STATE');
  assert.equal(statusOf(report.id), 'approved');
});

test('rejection stores the reason and keeps the report out of summaries', async () => {
  const report = await pendingReport();

  await app.message(message(ADMIN_TG_ID, ADMIN_TG_ID, `/reject ${report.id} قیمت ساختگی است`));
  assert.equal(statusOf(report.id), 'rejected');

  const row = app.database
    .prepare('SELECT review_note, reviewed_by FROM price_reports WHERE id = ?')
    .get(report.id);
  assert.equal(row.review_note, 'قیمت ساختگی است');
  assert.equal(row.reviewed_by, ADMIN_TG_ID);

  const summary = await app.reports.productPriceSummary(1);
  assert.equal(summary.count, 0);
});

test('invalid report ids are refused without touching data', async () => {
  await pendingReport();

  assert.equal((await app.moderation.approveReport(0, ADMIN_TG_ID)).error, 'REPORT_ID_INVALID');
  assert.equal((await app.moderation.approveReport('abc', ADMIN_TG_ID)).error, 'REPORT_ID_INVALID');
  assert.equal((await app.moderation.approveReport(-4, ADMIN_TG_ID)).error, 'REPORT_ID_INVALID');
  assert.equal((await app.moderation.approveReport(999, ADMIN_TG_ID)).error, 'REPORT_NOT_FOUND');
  assert.equal((await app.moderation.rejectReport(999, ADMIN_TG_ID, 'x')).error, 'REPORT_NOT_FOUND');

  await app.message(message(ADMIN_TG_ID, ADMIN_TG_ID, '/approve abc'));
  assert.match(lastText(), /شمارهٔ گزارش/);

  const pending = app.database.prepare("SELECT COUNT(*) AS n FROM price_reports WHERE status='pending'").get();
  assert.equal(pending.n, 1);
});

test('the pending queue lists only pending reports, oldest first', async () => {
  const first = await pendingReport({ price: 1_000_000 });
  const second = await pendingReport({ price: 2_000_000, store: 'ب' });
  const approved = await pendingReport({ price: 3_000_000, store: 'ج' });
  await app.moderation.approveReport(approved.id, ADMIN_TG_ID);

  const queue = await app.moderation.listPendingReports({ limit: 10 });
  assert.deepEqual(queue.map((row) => row.id), [first.id, second.id]);
  assert.equal(queue[0].productName.length > 0, true);
  assert.equal(queue[0].flagCount, 0);

  await app.message(message(ADMIN_TG_ID, ADMIN_TG_ID, '/pending'));
  assert.match(lastText(), /در انتظار بررسی/);
  assert.doesNotMatch(lastText(), new RegExp(`#${approved.id}\\b`));
});

test('inspect shows the submitted price, store, date and source — no personal data', async () => {
  const report = await app.reports.submitReport(
    { id: REPORTER, first_name: 'مریم' },
    {
      productId: 1,
      priceToman: 4_850_000,
      storeName: 'دیجی‌کالا',
      sourceUrl: 'https://shop.example/p/1',
    },
  );

  await app.message(message(ADMIN_TG_ID, ADMIN_TG_ID, `/inspect ${report.report.id}`));
  const text = lastText();

  assert.match(text, /۴٬۸۵۰٬۰۰۰ تومان/);
  assert.match(text, /دیجی‌کالا/);
  assert.match(text, /https:\/\/shop\.example\/p\/1/);
  assert.match(text, /در انتظار بررسی/);
  // The reporter's name and Telegram id are not part of the view.
  assert.doesNotMatch(text, /مریم/);
  assert.doesNotMatch(text, new RegExp(String(REPORTER)));
});

test('a user can flag somebody else’s published report, once', async () => {
  const report = await pendingReport();
  await app.moderation.approveReport(report.id, ADMIN_TG_ID);

  const flagger = await app.users.ensureUser({ id: OTHER_USER, first_name: 'بیننده' });
  const first = await app.moderation.flagReport(report.id, flagger.id);
  assert.equal(first.ok, true);
  assert.equal(first.flagCount, 1);

  const again = await app.moderation.flagReport(report.id, flagger.id);
  assert.equal(again.error, 'ALREADY_FLAGGED');
  assert.equal(await app.moderation.countFlags(report.id), 1);

  // A single flag is a signal for a human — the report stays approved.
  assert.equal(statusOf(report.id), 'approved');
});

test('flags are refused for own reports, unpublished reports and unknown ids', async () => {
  const report = await pendingReport();
  const author = await app.users.getUserByTgId(REPORTER);
  const viewer = await app.users.ensureUser({ id: OTHER_USER, first_name: 'بیننده' });

  // Own report, still pending.
  assert.equal((await app.moderation.flagReport(report.id, author.id)).error, 'REPORT_NOT_PUBLIC');

  await app.moderation.approveReport(report.id, ADMIN_TG_ID);

  assert.equal((await app.moderation.flagReport(report.id, author.id)).error, 'SELF_FLAG');
  assert.equal((await app.moderation.flagReport(999, viewer.id)).error, 'REPORT_NOT_FOUND');
  assert.equal((await app.moderation.flagReport('abc', viewer.id)).error, 'REPORT_ID_INVALID');
});

test('/flag reports back to the user and never changes the report', async () => {
  const report = await pendingReport();
  await app.moderation.approveReport(report.id, ADMIN_TG_ID);

  await app.message(message(OTHER_USER, OTHER_USER, `/flag ${report.id}`));
  assert.match(lastText(), /علامت زده شد/);
  assert.equal(statusOf(report.id), 'approved');

  await app.message(message(OTHER_USER, OTHER_USER, `/flag ${report.id}`));
  assert.match(lastText(), /قبلاً همین گزارش را علامت زده‌اید/);
});

test('the flag count reaches the moderation views', async () => {
  const report = await pendingReport();
  await app.moderation.approveReport(report.id, ADMIN_TG_ID);

  const viewer = await app.users.ensureUser({ id: OTHER_USER, first_name: 'بیننده' });
  await app.moderation.flagReport(report.id, viewer.id);

  const details = await app.moderation.inspectReport(report.id);
  assert.equal(details.flags.length, 1);

  const stats = await app.moderation.moderationStats();
  assert.equal(stats.approved, 1);
  assert.equal(stats.flaggedReports, 1);
  assert.equal(stats.flags, 1);
});

test('non-administrators cannot reach /admin, /pending, /inspect or /seed', async () => {
  for (const command of ['/admin', '/pending', '/inspect 1', '/seed']) {
    await app.message(message(OTHER_USER, OTHER_USER, command));
    assert.equal(lastMethod(), 'sendMessage');
    assert.match(lastText(), /در دسترس شما نیست/, command);
  }
  // The catalog was already seeded by the fixture; an unauthorised /seed must
  // not have touched it.
  const products = app.database.prepare('SELECT COUNT(*) AS n FROM products').get();
  assert.equal(products.n, 38);
});

test('the admin overview never reveals the configured ids', async () => {
  await app.message(message(ADMIN_TG_ID, ADMIN_TG_ID, '/admin'));
  const text = lastText();

  assert.match(text, /مدیریت/);
  assert.match(text, /صف بررسی|در انتظار بررسی/);
  assert.doesNotMatch(text, new RegExp(String(ADMIN_TG_ID)));
});

test('malformed callback and command input is answered, not crashed', async () => {
  const report = await pendingReport();

  const query = { id: 'cb-1', data: '__proto__', message: { message_id: 5, chat: { id: ADMIN_TG_ID } } };
  await app.callbackQuery(query); // unknown data: answered, nothing rendered
  await app.callbackQuery({ ...query, data: 'catalog:page:-1' });
  await app.callbackQuery({ ...query, data: 'catalog:page:999999' });

  for (const command of ['/approve', '/reject', '/inspect', '/flag', '/product', '/report']) {
    await app.message(message(ADMIN_TG_ID, ADMIN_TG_ID, command));
    assert.equal(lastMethod(), 'sendMessage', command);
  }

  assert.equal(statusOf(report.id), 'pending');
});
