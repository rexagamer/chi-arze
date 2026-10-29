// One end-to-end walk through the product's whole journey, in order.
//
// The other suites test each rule in isolation; this one tests the *links*
// between them — that a report submitted by one person is exactly what the
// moderator sees, that an approval is exactly what the price page shows, and
// that a rejected report is what nobody sees. If a refactor breaks the seam
// between two features, this is the test that notices.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTestApp, lastScreen, lastText, message } from './support/app.mjs';

const ADMIN = 9001;
const A = 1001;
const B = 1002;
const C = 1003;

test('a user browses, reports, moderates and flags without leaving a broken link', async () => {
  const app = await createTestApp();
  const config = await import('../tgcloud/lib/config.js');
  config.ADMIN_IDS.length = 0;
  config.ADMIN_IDS.push(ADMIN);
  await app.catalog.seedCatalog();

  const buttons = () => lastScreen()[1].reply_markup?.inline_keyboard?.flat() ?? [];
  const press = (data, from) =>
    app.callbackQuery({
      id: `cb-${data}`,
      from: { id: from },
      data,
      message: { message_id: 1, chat: { id: from } },
    });
  const toast = () => app.calls.filter(([method]) => method === 'answerCallbackQuery').at(-1)?.[1]?.text ?? '';
  const statusOf = (id) =>
    app.database.prepare('SELECT status FROM price_reports WHERE id = ?').get(id)?.status;

  // 1–4. Welcome, browse, search, choose.
  await app.message(message(A, A, '/start'));
  assert.match(lastText(), /چی‌ارزه/);

  await press('catalog:page:0', A);
  assert.match(lastText(), /کالاها/);
  assert.equal(buttons().some((button) => button.callback_data.startsWith('product:')), true);

  await app.message(message(A, A, '/search شارژر'));
  assert.match(lastText(), /نتایج/);

  await press('product:1', A);
  assert.match(lastText(), /شارژر USB-C ۲۰ وات/);

  // 5–7. Three people report; the numbers stay off the page meanwhile.
  for (const [index, userId] of [A, B, C].entries()) {
    await app.message(message(userId, userId, `/report 1 | ${4_800_000 + index * 100_000} | فروشگاه ${index + 1}`));
    assert.match(lastText(), /در انتظار بررسی/);
  }

  await app.message(message(A, A, '/report 1 | 4800000 | فروشگاه 1'));
  assert.match(lastText(), /قبلاً ثبت کرده‌اید/);

  await press('product:1', A);
  assert.match(lastText(), /هنوز قیمت تأییدشده/);
  assert.match(lastText(), /۳ گزارش در انتظار بررسی/);

  // 8–10. A pending report cannot be flagged or moderated by outsiders.
  await app.message(message(B, B, '/flag 1'));
  assert.match(lastText(), /فقط گزارش‌های تأییدشده/);

  await app.message(message(A, A, '/approve 1'));
  assert.match(lastText(), /در دسترس شما نیست/);

  await press('mod:approve:1', B);
  assert.equal(statusOf(1), 'pending');
  assert.match(toast(), /در دسترس شما نیست/);

  // 11–13. The administrator reviews and decides.
  await app.message(message(ADMIN, ADMIN, '/pending'));
  assert.match(lastText(), /در انتظار بررسی/);
  assert.equal(buttons().some((button) => button.text.startsWith('✅')), true);

  await app.message(message(ADMIN, ADMIN, '/inspect 1'));
  assert.match(lastText(), /فروشگاه 1/);
  assert.doesNotMatch(lastText(), /کاربر/); // no reporter identity on screen

  await press('mod:approve:1', ADMIN);
  assert.equal(statusOf(1), 'approved');
  assert.match(toast(), /تأیید شد/);

  await app.message(message(ADMIN, ADMIN, '/approve 2'));
  await press('mod:reject:3', ADMIN);
  assert.equal(statusOf(2), 'approved');
  assert.equal(statusOf(3), 'rejected');

  // 14–15. The price page shows approved only.
  await press('product:1', A);
  assert.match(lastText(), /۴٬۸۰۰٬۰۰۰/);
  assert.match(lastText(), /۴٬۹۰۰٬۰۰۰/);
  assert.doesNotMatch(lastText(), /۵٬۰۰۰٬۰۰۰/);

  // 16–18. Flags: once, from someone else.
  await press('flag:1', B);
  assert.equal(await app.moderation.countFlags(1), 1);
  await press('flag:1', B);
  assert.equal(await app.moderation.countFlags(1), 1);
  await press('flag:1', A);
  assert.equal(await app.moderation.countFlags(1), 1);
  assert.equal(statusOf(1), 'approved'); // a flag never changes the status

  // 19–20. Nothing invalid crashes, and the user is told.
  await press('__proto__', A);
  assert.match(toast(), /معتبر نیست/);
  await press('product:424242', A);
  assert.match(toast(), /پیدا نشد/);

  // The published summary agrees with everything above.
  const summary = await app.reports.productPriceSummary(1);
  assert.equal(summary.count, 2);
  assert.equal(summary.contributors, 2);
  assert.equal(summary.median, 4_850_000);
  assert.equal(summary.showMedian, false); // two people is not enough
  assert.equal(summary.pendingCount, 0);
});
