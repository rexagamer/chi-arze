import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePrice,
  parseReportInput,
  parseSourceUrl,
  parseStoreName,
} from '../tgcloud/lib/report-input.js';

test('a complete report line parses into the values we store', () => {
  const result = parseReportInput('5 | 4,850,000 | دیجی‌کالا | https://example.com/p/12');

  assert.equal(result.ok, true);
  assert.equal(result.value.productId, 5);
  assert.equal(result.value.priceToman, 4_850_000);
  assert.equal(result.value.storeName, 'دیجی‌کالا');
  assert.equal(result.value.sourceUrl, 'https://example.com/p/12');
});

test('the source URL is optional', () => {
  const result = parseReportInput('7 | 1.250.000 | دیجی کالا');
  assert.equal(result.ok, true);
  assert.equal(result.value.priceToman, 1_250_000);
  assert.equal(result.value.sourceUrl, null);

  // A trailing separator is tolerated, it does not create a fifth field.
  const trailing = parseReportInput('7 | 1250000 | دیجی کالا |');
  assert.equal(trailing.ok, true);
  assert.equal(trailing.value.sourceUrl, null);
});

test('missing fields are a usage error, extra fields are rejected', () => {
  assert.equal(parseReportInput('').error, 'USAGE');
  assert.equal(parseReportInput('5 | 1250000').error, 'USAGE');
  assert.equal(parseReportInput('5 | 1250000 | دیجی‌کالا | https://a.example | extra').error, 'TOO_MANY_FIELDS');
});

test('the product id must be a positive integer, in any digit set', () => {
  assert.equal(parseReportInput('abc | 1250000 | فروشگاه').error, 'PRODUCT_ID_INVALID');
  assert.equal(parseReportInput('0 | 1250000 | فروشگاه').error, 'PRODUCT_ID_INVALID');
  assert.equal(parseReportInput('-3 | 1250000 | فروشگاه').error, 'PRODUCT_ID_INVALID');

  assert.equal(parseReportInput('۱۲ | 1250000 | فروشگاه').value.productId, 12);
  assert.equal(parseReportInput('١٢ | 1250000 | فروشگاه').value.productId, 12);
});

test('prices are whole toman in Persian, Arabic-Indic or Latin digits', () => {
  assert.equal(parsePrice('4850000').value, 4_850_000);
  assert.equal(parsePrice('۴٬۸۵۰٬۰۰۰').value, 4_850_000);
  assert.equal(parsePrice('٤٨٥٠٠٠٠').value, 4_850_000);
  assert.equal(parsePrice('4,850,000 تومان').value, 4_850_000);
  assert.equal(parsePrice('۱.۵ میلیون').value, 1_500_000);
});

test('prices that are empty, negative, decimal, unsafe or rial are rejected', () => {
  assert.equal(parsePrice('').error, 'PRICE_EMPTY');
  assert.equal(parsePrice('   ').error, 'PRICE_EMPTY');
  assert.equal(parsePrice('سلام').error, 'PRICE_INVALID');
  assert.equal(parsePrice('-5000').error, 'PRICE_INVALID');
  assert.equal(parsePrice('1250.5').error, 'PRICE_INVALID'); // decimals are not toman
  assert.equal(parsePrice('99999999999999999999').error, 'PRICE_INVALID'); // unsafe integer
  // Rial is never converted into toman — it is simply not accepted.
  assert.equal(parsePrice('48500000 ریال').error, 'PRICE_INVALID');
  assert.equal(parsePrice('1250000 ریال').error, 'PRICE_INVALID');
});

test('prices outside the configured limits are rejected with the limits attached', () => {
  const low = parsePrice('500');
  assert.equal(low.error, 'PRICE_OUT_OF_RANGE');
  assert.equal(low.detail.min, 1_000);

  const high = parsePrice('250,000,000');
  assert.equal(high.error, 'PRICE_OUT_OF_RANGE');
  assert.equal(high.detail.max, 100_000_000);
});

test('the store name is kept readable but validated', () => {
  assert.equal(parseStoreName('  دیجی   کالا ').value, 'دیجی کالا');
  assert.equal(parseStoreName('').error, 'STORE_EMPTY');
  assert.equal(parseStoreName('!!!').error, 'STORE_INVALID');
  assert.equal(parseStoreName('ا'.repeat(61)).error, 'STORE_TOO_LONG');
  assert.equal(parseStoreName('ا'.repeat(60)).ok, true);
});

test('the parsed report keeps the store name readable, not folded', () => {
  // Folding is a storage concern (`reports.js` derives the duplicate key), so the
  // parser must not rewrite what the user typed.
  assert.equal(parseReportInput('1 | 1250000 | ديـجي كالا').value.storeName, 'ديـجي كالا');
  assert.equal(parseStoreName('ديجي كالا').value, 'ديجي كالا');
});

test('the source URL must be an http(s) URL and is never fetched', () => {
  assert.equal(parseSourceUrl('').value, null);
  assert.equal(parseSourceUrl('https://shop.example/p/1').value, 'https://shop.example/p/1');
  assert.equal(parseSourceUrl('http://shop.example').ok, true);

  assert.equal(parseSourceUrl('ftp://shop.example/x').error, 'URL_INVALID');
  assert.equal(parseSourceUrl('javascript:alert(1)').error, 'URL_INVALID');
  assert.equal(parseSourceUrl('دیجی‌کالا').error, 'URL_INVALID');
  assert.equal(parseSourceUrl(`https://example.com/${'a'.repeat(200)}`).error, 'URL_TOO_LONG');
});
