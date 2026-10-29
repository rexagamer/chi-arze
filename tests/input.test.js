import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PRICE_LIMITS } from '../tgcloud/lib/config.js';
import { cleanFreeText, parseToman, priceRangeError, toPositiveInt } from '../tgcloud/lib/input.js';

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

test('toPositiveInt accepts sensible ids and rejects everything else', () => {
  assert.equal(toPositiveInt('12'), 12);
  assert.equal(toPositiveInt(' ۷ '), 7);
  assert.equal(toPositiveInt(3), 3);
  // Unknown, malformed or out-of-range ids must never reach a query.
  assert.equal(toPositiveInt('abc'), null);
  assert.equal(toPositiveInt('0'), null);
  assert.equal(toPositiveInt('-4'), null);
  assert.equal(toPositiveInt(''), null);
  assert.equal(toPositiveInt(null), null);
  assert.equal(toPositiveInt(undefined), null);
});
