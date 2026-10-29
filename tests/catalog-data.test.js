import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORIES,
  SEED_PRODUCTS,
  categoryLabel,
  toProductRow,
} from '../tgcloud/lib/catalog-data.js';

// `toProductRow` is the same function the seeder uses, so these tests check the
// rows that would actually be inserted.

test('the seed catalog is non-empty and every entry is complete', () => {
  assert.ok(SEED_PRODUCTS.length >= 10);
  for (const entry of SEED_PRODUCTS) {
    assert.ok(entry.name.trim().length > 0, 'every product needs a name');
    assert.ok(CATEGORIES[entry.category], `${entry.name} has category "${entry.category}"`);
    assert.equal(entry.price, undefined, 'the catalog must not carry prices');
  }
});

test('required product types are present as distinct products', () => {
  const names = SEED_PRODUCTS.map((entry) => entry.name);
  const required = [
    /کابل USB-C به USB-C ۱ متری/,
    /کابل لایتنینگ ۱ متری/,
    /شارژر USB-C ۲۰ وات/,
    /شارژر USB-C ۲۵ وات/,
    /پاوربانک ۱۰۰۰۰ میلی‌آمپرساعت/,
    /پاوربانک ۲۰۰۰۰ میلی‌آمپرساعت/,
    /هندزفری سیمی USB-C/,
    /هندزفری بلوتوثی/,
    /شارژر فندکی/,
    /نگهدارنده/,
  ];

  for (const pattern of required) {
    assert.equal(names.filter((name) => pattern.test(name)).length, 1, `missing: ${pattern}`);
  }
});

test('normalized names are unique, so seeding cannot create duplicates', () => {
  const rows = SEED_PRODUCTS.map(toProductRow);
  const normalized = rows.map((row) => row.normalizedName);
  const duplicates = normalized.filter((name, index) => normalized.indexOf(name) !== index);

  assert.deepEqual(duplicates, []);
  assert.equal(new Set(normalized).size, rows.length);
});

test('normalized rows are already searchable: latin digits, folded letters', () => {
  const rows = SEED_PRODUCTS.map(toProductRow);
  const twentyWatt = rows.find((row) => row.name === 'شارژر USB-C ۲۰ وات');

  assert.equal(twentyWatt.normalizedName, 'شارژر usb c 20 وات');
  assert.match(twentyWatt.keywords, /\b20w\b/);
  // Keywords are normalized too, so a Persian-Arabic variant matches.
  assert.equal(rows.some((row) => /[\u064A\u0643]/.test(row.normalizedName + row.keywords)), false);
});

test('categories are labelled for display', () => {
  assert.equal(categoryLabel('charger'), 'شارژر');
  assert.equal(categoryLabel('audio'), 'هندزفری و هدفون');
  assert.equal(categoryLabel('nonsense'), 'دسته‌بندی‌نشده');
});
