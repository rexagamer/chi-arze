import { test } from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml, formatRelativeTime, formatToman, toPersianDigits } from '../tgcloud/lib/format.js';

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
