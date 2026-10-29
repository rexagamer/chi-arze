// End-to-end tests for submission and price summaries, against real SQLite.
// The SDK double is loaded by `tests/support/app.mjs`; every test starts from an
// empty database built from `tgcloud/schema.js`.

import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { createTestApp, lastText, message } from './support/app.mjs';

let app;
let config;

const user = (id) => ({ id, first_name: `user-${id}` });

beforeEach(async () => {
  app = await createTestApp();
  config = await import('../tgcloud/lib/config.js');
  await app.catalog.seedCatalog();
});

/** Submit directly (the handler is tested separately). */
function report(productId, priceToman, storeName = 'دیجی‌کالا', from = user(1001)) {
  return app.reports.submitReport(from, {
    productId,
    priceToman,
    storeName,
    sourceUrl: null,
  });
}

/** Age a report, the way time would. */
function backdate(reportId, hours) {
  const seconds = Math.floor(Date.now() / 1000) - hours * 3600;
  app.database.prepare('UPDATE price_reports SET created_at = ? WHERE id = ?').run(seconds, reportId);
}

test('a valid report is stored pending, with the store and source URL', async () => {
  const result = await app.reports.submitReport(
    user(1001),
    {
      productId: 1,
      priceToman: 4_850_000,
      storeName: 'دیجی‌کالا',
      sourceUrl: 'https://shop.example/p/1',
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.report.status, 'pending');
  assert.equal(result.report.priceToman, 4_850_000);
  assert.equal(result.report.storeName, 'دیجی‌کالا');
  assert.equal(result.report.sourceUrl, 'https://shop.example/p/1');

  const stored = await app.reports.getReportById(result.report.id);
  assert.equal(stored.status, 'pending');
  assert.equal(stored.reviewedBy, null);
});

test('an unknown product is rejected before anything is written', async () => {
  const result = await report(9999, 4_000_000);
  assert.equal(result.error, 'PRODUCT_NOT_FOUND');

  const rows = app.database.prepare('SELECT COUNT(*) AS n FROM price_reports').get();
  assert.equal(rows.n, 0);
});

test('an inactive product cannot receive new reports', async () => {
  app.database.prepare('UPDATE products SET is_active = 0 WHERE id = 2').run();
  const result = await report(2, 4_000_000);
  assert.equal(result.error, 'PRODUCT_INACTIVE');
});

test('a user with no Telegram identity cannot report', async () => {
  const result = await app.reports.submitReport({}, {
    productId: 1,
    priceToman: 1000,
    storeName: 'x',
    sourceUrl: null,
  });
  assert.equal(result.error, 'USER_UNKNOWN');
});

test('the same report from the same user is a duplicate inside the window', async () => {
  const first = await report(1, 4_850_000, 'دیجی‌کالا');
  assert.equal(first.ok, true);

  const again = await report(1, 4_850_000, 'ديجي كالا'); // Arabic spelling, same store
  assert.equal(again.error, 'DUPLICATE');
  assert.equal(again.detail.reportId, first.report.id);
});

test('a different price, store, product or person is not a duplicate', async () => {
  await report(1, 4_850_000, 'دیجی‌کالا');

  assert.equal((await report(1, 4_900_000, 'دیجی‌کالا')).ok, true);
  assert.equal((await report(1, 4_850_000, 'ترب')).ok, true);
  assert.equal((await report(2, 4_850_000, 'دیجی‌کالا')).ok, true);
  assert.equal((await report(1, 4_850_000, 'دیجی‌کالا', user(1002))).ok, true);
});

test('the same price may be reported again once the duplicate window passes', async () => {
  const first = await report(1, 4_850_000, 'دیجی‌کالا');
  backdate(first.report.id, config.REPORT_LIMITS.duplicateWindowHours + 1);

  const again = await report(1, 4_850_000, 'دیجی‌کالا');
  assert.equal(again.ok, true);
});

test('the per-user rate limit is enforced from the database', async () => {
  const { perWindow } = config.REPORT_LIMITS;
  for (let index = 0; index < perWindow; index += 1) {
    const result = await report(1, 1_000_000 + index * 1000, `فروشگاه ${index}`);
    assert.equal(result.ok, true, `report ${index + 1} should be accepted`);
  }

  const blocked = await report(1, 2_000_000, 'فروشگاه دیگر');
  assert.equal(blocked.error, 'RATE_LIMITED');
  assert.equal(blocked.detail.limit, perWindow);

  const count = app.database.prepare('SELECT COUNT(*) AS n FROM price_reports').get();
  assert.equal(count.n, perWindow);
});

test('the rate limit is per user, and older reports stop counting', async () => {
  const { perWindow, windowHours } = config.REPORT_LIMITS;
  for (let index = 0; index < perWindow; index += 1) {
    const result = await report(1, 1_000_000 + index * 1000, `فروشگاه ${index}`);
    backdate(result.report.id, windowHours + 1);
  }

  // The window has moved on, so this user may report again…
  assert.equal((await report(1, 5_000_000, 'فروشگاه تازه')).ok, true);
  // …and another user was never affected.
  assert.equal((await report(1, 6_000_000, 'فروشگاه', user(1002))).ok, true);
});

test('summaries only count approved reports', async () => {
  const approved = await report(1, 1_000_000, 'الف');
  const pending = await report(1, 2_000_000, 'ب');
  const rejected = await report(1, 3_000_000, 'ج', user(1002));

  await app.moderation.approveReport(approved.report.id, 2002);
  await app.moderation.rejectReport(rejected.report.id, 2002, 'قیمت نامعتبر');

  const summary = await app.reports.productPriceSummary(1);

  assert.equal(summary.count, 1);
  assert.equal(summary.median, 1_000_000);
  assert.equal(summary.min, 1_000_000);
  assert.equal(summary.max, 1_000_000);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.reports.length, 1);
  assert.equal(summary.reports[0].id, approved.report.id);
  // The rejected and pending reports are nowhere in the numbers.
  assert.equal(summary.reports.some((r) => r.id === rejected.report.id), false);
  assert.equal(summary.reports.some((r) => r.id === pending.report.id), false);
});

test('summaries count distinct contributors, not reports', async () => {
  const first = await report(1, 1_000_000, 'الف', user(1001));
  const second = await report(1, 1_200_000, 'ب', user(1001));
  const third = await report(1, 1_400_000, 'ج', user(1002));
  for (const one of [first, second, third]) await app.moderation.approveReport(one.report.id, 2002);

  const summary = await app.reports.productPriceSummary(1);
  assert.equal(summary.count, 3);
  assert.equal(summary.contributors, 2);
  assert.equal(summary.median, 1_200_000);
  assert.equal(summary.showMedian, false); // two people is not enough
});

test('reports outside the recent window are excluded from summaries', async () => {
  const old = await report(1, 1_000_000, 'الف');
  await app.moderation.approveReport(old.report.id, 2002);
  backdate(old.report.id, (config.SUMMARY.recentDays + 1) * 24);

  const summary = await app.reports.productPriceSummary(1);
  assert.equal(summary.count, 0);
  assert.equal(summary.median, null);
  assert.equal(summary.latestAt, null);
});

test('a summary older than the stale threshold is marked stale', async () => {
  const one = await report(1, 1_000_000, 'الف');
  await app.moderation.approveReport(one.report.id, 2002);
  backdate(one.report.id, (config.SUMMARY.staleAfterDays + 2) * 24);

  const summary = await app.reports.productPriceSummary(1);
  assert.equal(summary.count, 1);
  assert.equal(summary.isStale, true);
});

test('the reporter sees a pending confirmation, never a published price', async () => {
  await app.message(message(1001, 1001, '/report 1 | 4,850,000 | دیجی‌کالا'));
  const text = lastText();

  assert.match(text, /در انتظار بررسی/);
  assert.match(text, /۴٬۸۵۰٬۰۰۰ تومان/);
  assert.doesNotMatch(text, /تأیید شد/);

  const stored = app.database.prepare('SELECT status FROM price_reports').get();
  assert.equal(stored.status, 'pending');
});

test('rejected reports never appear in the product page', async () => {
  const one = await report(1, 1_000_000, 'الف');
  await app.moderation.rejectReport(one.report.id, 2002, 'اطلاعات ناقص');

  await app.message(message(1001, 1001, '/product 1'));
  const text = lastText();

  assert.match(text, /هنوز قیمت تأییدشده‌ای/);
  assert.doesNotMatch(text, /۱٬۰۰۰٬۰۰۰/);
});

test('the product page shows a median only with enough contributors', async () => {
  for (const [index, from] of [user(1), user(2), user(3)].entries()) {
    const result = await report(1, 1_000_000 + index * 100_000, `فروشگاه ${index}`, from);
    await app.moderation.approveReport(result.report.id, 2002);
  }

  await app.message(message(1001, 1, '/product 1'));
  const text = lastText();

  assert.match(text, /میانهٔ قیمت/);
  assert.match(text, /۱٬۱۰۰٬۰۰۰ تومان/); // median of 1.0M, 1.1M, 1.2M
  assert.match(text, /۳ گزارش از ۳ نفر/);
});

test('/price is an alias for the product price page', async () => {
  const one = await report(1, 1_000_000, 'الف');
  await app.moderation.approveReport(one.report.id, 2002);

  await app.message(message(1001, 1001, '/price 1'));
  const viaAlias = lastText();

  await app.message(message(1001, 1001, '/product 1'));
  assert.equal(viaAlias, lastText());
  assert.match(viaAlias, /۱ گزارش تأییدشده/);
});
