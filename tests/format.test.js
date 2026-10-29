import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeHtml,
  formatDate,
  formatRelativeTime,
  formatToman,
  toPersianDigits,
} from '../tgcloud/lib/format.js';

test('toPersianDigits replaces every ASCII digit', () => {
  assert.equal(toPersianDigits('0123456789'), '۰۱۲۳۴۵۶۷۸۹');
});

test('formatToman groups thousands and labels the unit', () => {
  assert.equal(formatToman(1_250_000), '۱٬۲۵۰٬۰۰۰ تومان');
  assert.equal(formatToman(950), '۹۵۰ تومان');
  assert.equal(formatToman(0), '۰ تومان');
});

test('formatRelativeTime describes recency in Persian', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  const ago = (seconds) => new Date(now.getTime() - seconds * 1000);

  assert.equal(formatRelativeTime(ago(5), now), 'همین حالا');
  assert.equal(formatRelativeTime(ago(5 * 60), now), '۵ دقیقه پیش');
  assert.equal(formatRelativeTime(ago(3 * 60 * 60), now), '۳ ساعت پیش');
  assert.equal(formatRelativeTime(ago(2 * 24 * 60 * 60), now), '۲ روز پیش');
  assert.equal(formatRelativeTime(ago(45 * 24 * 60 * 60), now), '۱ ماه پیش');
  assert.equal(formatRelativeTime(ago(800 * 24 * 60 * 60), now), '۲ سال پیش');
});

test('escapeHtml neutralises markup from user input', () => {
  assert.equal(escapeHtml('<b>&</b>'), '&lt;b&gt;&amp;&lt;/b&gt;');
  assert.equal(escapeHtml(null), '');
});

test('dates are shown in the Jalali calendar, in Tehran time', () => {
  // Nowruz is the anchor everyone can check.
  assert.equal(formatDate('2024-03-20T12:00:00Z'), '۱ فروردین ۱۴۰۳');
  assert.equal(formatDate('2025-03-20T12:00:00Z'), '۳۰ اسفند ۱۴۰۳');
  assert.equal(formatDate('2026-03-21T12:00:00Z'), '۱ فروردین ۱۴۰۵');
  assert.equal(formatDate('2026-10-29T12:00:00Z'), '۷ آبان ۱۴۰۵');

  // 21:30 UTC is already the next day in Tehran (+03:30), and both sides of
  // midnight must land on the same Persian date.
  assert.equal(formatDate('2025-12-31T21:30:00Z'), formatDate('2026-01-01T00:30:00Z'));
});
