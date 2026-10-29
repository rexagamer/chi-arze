import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  foldChars,
  normalizeDigits,
  normalizeText,
  tokenize,
} from '../tgcloud/lib/normalize.js';

test('Persian and Arabic spellings of the same word normalize identically', () => {
  // Arabic yeh/kaf vs Persian yeh/kaf.
  assert.equal(normalizeText('آيفون'), normalizeText('آیفون'));
  assert.equal(normalizeText('كيف'), normalizeText('کیف'));
  assert.equal(normalizeText('شارژر كیف'), 'شارژر کیف');
  // Alef variants.
  assert.equal(normalizeText('أپل'), normalizeText('اپل'));
  assert.equal(normalizeText('آپل'), normalizeText('اپل'));
});

test('Persian, Arabic-Indic and Latin digits all normalize to Latin digits', () => {
  assert.equal(normalizeText('۲۰ وات'), '20 وات');
  assert.equal(normalizeText('٢٥ وات'), '25 وات');
  assert.equal(normalizeText('25 وات'), '25 وات');
  assert.equal(normalizeDigits('۰۱۲۳۴۵۶۷۸۹'), '0123456789');
  assert.equal(normalizeDigits('٠١٢٣٤٥٦٧٨٩'), '0123456789');
});

test('whitespace is collapsed and trimmed', () => {
  assert.equal(normalizeText('  شارژر   اپل  '), 'شارژر اپل');
  assert.equal(normalizeText('شارژر\n\nاپل\t۲۰'), 'شارژر اپل 20');
  assert.equal(normalizeText('   '), '');
});

test('punctuation separates words instead of joining or hiding them', () => {
  assert.equal(normalizeText('USB-C به USB-C'), 'usb c به usb c');
  assert.equal(normalizeText('پاوربانک (۱۰۰۰۰)'), 'پاوربانک 10000');
  assert.equal(normalizeText('«شارژر»، اپل!'), 'شارژر اپل');
});

test('thousands separators inside numbers are removed, not turned into spaces', () => {
  assert.equal(normalizeText('۱۰٬۰۰۰ میلی‌آمپرساعت'), '10000 میلی امپرساعت');
  assert.equal(normalizeText('10,000mAh'), '10000mah');
  assert.equal(normalizeText('20,000'), '20000');
});

test('diacritics, tatweel and zero-width marks are dropped', () => {
  assert.equal(normalizeText('شارژِرِ اَپل'), normalizeText('شارژر اپل'));
  assert.equal(normalizeText('شارژر'), 'شارژر');
  assert.equal(normalizeText('هندزفری\u200cسیمی'), 'هندزفری سیمی');
  assert.equal(normalizeText('کـــابل'), 'کابل');
});

test('technical specifications survive normalization and stay distinguishable', () => {
  const twenty = normalizeText('شارژر USB-C ۲۰ وات');
  const twentyFive = normalizeText('شارژر USB-C ۲۵ وات');
  assert.equal(twenty, 'شارژر usb c 20 وات');
  assert.notEqual(twenty, twentyFive);

  const ten = normalizeText('پاوربانک ۱۰۰۰۰ میلی‌آمپرساعت');
  const twentyThousand = normalizeText('پاوربانک ۲۰۰۰۰ میلی‌آمپرساعت');
  assert.equal(ten, 'پاوربانک 10000 میلی امپرساعت');
  assert.notEqual(ten, twentyThousand);
});

test('foldChars keeps punctuation for the price parser', () => {
  // The full pipeline would destroy the decimal point; folding must not.
  assert.equal(foldChars('۱.۵'), '1.5');
  assert.equal(foldChars('۱٬۲۵۰٬۰۰۰'), '1٬250٬000');
});

test('tokenize splits, de-duplicates and caps words', () => {
  assert.deepEqual(tokenize('شارژر  اپل شارژر'), ['شارژر', 'اپل']);
  assert.deepEqual(tokenize('   '), []);
  assert.deepEqual(tokenize('a b c d', 2), ['a', 'b']);
});
