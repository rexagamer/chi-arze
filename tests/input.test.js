import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PRICE_LIMITS } from '../tgcloud/lib/config.js';
import {
  cleanFreeText,
  normalizeDigits,
  normalizeSearchText,
  parseToman,
  priceRangeError,
} from '../tgcloud/lib/input.js';

test('normalizeDigits converts Persian and Arabic-Indic digits', () => {
  assert.equal(normalizeDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
  assert.equal(normalizeDigits('٤٥٦'), '456');
});

test('normalizeSearchText folds spelling variants and drops invisible characters', () => {
  assert.equal(normalizeSearchText('آيفون'), normalizeSearchText('آیفون'));
  assert.equal(normalizeSearchText('كي\u200cف'), normalizeSearchText('کيف'));
  assert.equal(normalizeSearchText('  اپل   ۲۰ وات '), 'اپل 20 وات');
});

test('parseToman accepts the ways people actually write prices', () => {
  assert.equal(parseToman('1250000'), 1_250_000);
  assert.equal(parseToman('1,250,000'), 1_250_000);
  assert.equal(parseToman('۱٬۲۵۰٬۰۰۰ تومان'), 1_250_000);
  assert.equal(parseToman('1.250.000'), 1_250_000);
  assert.equal(parseToman('۱.۵ میلیون'), 1_500_000);
  assert.equal(parseToman('950 هزار'), 950_000);
  assert.equal(parseToman('۲ میلیون و ۳۰۰ هزار'), 2_300_000);
});

test('parseToman rejects things that are not a whole price', () => {
  assert.equal(parseToman(''), null);
  assert.equal(parseToman('سلام'), null);
  assert.equal(parseToman('0'), null);
  assert.equal(parseToman('-500'), null);
  assert.equal(parseToman('1250.5'), null);
  assert.equal(parseToman(null), null);
  // Spaced groups are ambiguous: 1 + 250 + 0 would be a wrong price, so reject.
  assert.equal(parseToman('1 250 000'), null);
  // Rial and toman differ by a factor of ten — never guess which one was meant.
  assert.equal(parseToman('1250000 ریال'), null);
});

test('priceRangeError explains the bounds in toman', () => {
  assert.equal(priceRangeError(1_250_000), null);
  assert.match(priceRangeError(PRICE_LIMITS.min - 1), /کم\u200cترین/);
  assert.match(priceRangeError(PRICE_LIMITS.max + 1), /بیش\u200cترین/);
  assert.match(priceRangeError(0), /صفر/);
});

test('cleanFreeText collapses whitespace and respects the limit', () => {
  assert.equal(cleanFreeText('  دیجی   کالا  '), 'دیجی کالا');
  assert.equal(cleanFreeText('   '), null);
  assert.equal(cleanFreeText('abcdef', 3), 'abc');
});
