import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SEED_PRODUCTS } from '../tgcloud/lib/catalog-data.js';
import { normalizeText } from '../tgcloud/lib/normalize.js';
import { likePatterns, queryTokens, rankMatches } from '../tgcloud/lib/search.js';

// Stand-ins for database rows: the seeder stores exactly these two normalized
// columns, which are the only ones search reads.
const ROWS = SEED_PRODUCTS.map((entry, index) => ({
  id: index + 1,
  name: entry.name,
  normalizedName: normalizeText(entry.name),
  keywords: entry.keywords ? normalizeText(entry.keywords) : null,
}));

/**
 * Emulates the SQL filter in `searchProducts` (every token must appear in the
 * name or the keywords). The real query is checked against SQLite separately;
 * this keeps the ranking tests honest about what the database returns.
 */
function candidates(query) {
  const tokens = queryTokens(query);
  if (!tokens.length) return [];
  return ROWS.filter((row) =>
    tokens.every(
      (token) => row.normalizedName.includes(token) || (row.keywords ?? '').includes(token),
    ),
  );
}

const search = (query) => rankMatches(candidates(query), query).map((row) => row.name);

test('empty and blank queries match nothing', () => {
  assert.deepEqual(queryTokens(''), []);
  assert.deepEqual(queryTokens('   '), []);
  assert.deepEqual(search(''), []);
  assert.deepEqual(candidates('').length, 0);
});

test('queries with no results return an empty list', () => {
  assert.deepEqual(search('میکسر صدای استودیو'), []);
});

test('exact product name ranks first', () => {
  const results = search('شارژر USB-C ۲۰ وات');
  assert.equal(results[0], 'شارژر USB-C ۲۰ وات');
  assert.ok(results.length >= 1);
});

test('partial names match', () => {
  const results = search('پاوربانک');
  assert.ok(results.length >= 5);
  assert.ok(results.every((name) => name.includes('پاوربانک')));
});

test('specifications are respected: 20W and 25W do not collapse into each other', () => {
  // Both 25W entries are legitimate matches; the exact name comes first.
  const twentyFiveWatts = search('شارژر USB-C ۲۵ وات');
  assert.equal(twentyFiveWatts[0], 'شارژر USB-C ۲۵ وات');
  assert.ok(twentyFiveWatts.every((name) => name.includes('۲۵ وات')));

  const twentyWatts = search('شارژر USB-C ۲۰ وات');
  assert.equal(twentyWatts[0], 'شارژر USB-C ۲۰ وات');
  assert.ok(twentyWatts.every((name) => name.includes('۲۰ وات')));

  const ten = search('پاوربانک ۱۰۰۰۰');
  const twenty = search('پاوربانک ۲۰۰۰۰');
  assert.ok(ten.includes('پاوربانک ۱۰۰۰۰ میلی‌آمپرساعت'));
  assert.ok(!ten.includes('پاوربانک ۲۰۰۰۰ میلی‌آمپرساعت'));
  assert.ok(twenty.includes('پاوربانک ۲۰۰۰۰ میلی‌آمپرساعت'));
  assert.ok(!twenty.includes('پاوربانک ۱۰۰۰۰ میلی‌آمپرساعت'));
});

test('Persian, Arabic-spelled and digit-variant queries find the same products', () => {
  assert.deepEqual(search('آيفون ۱۵'), search('آیفون ۱۵'));
  assert.deepEqual(search('شارژر ۲۰ وات'), search('شارژر ٢٠ وات'));
  assert.deepEqual(search('كابل لايتنينگ'), search('کابل لایتنینگ'));
});

test('English terms and brands match through keywords', () => {
  assert.ok(search('power bank').length >= 5);
  assert.ok(search('anker').length >= 4);
  assert.ok(search('lightning cable').some((name) => name.includes('لایتنینگ')));
  assert.deepEqual(search('car charger'), ['شارژر فندکی ۲۰ وات']);
});

test('name matches outrank keyword-only matches, with a stable order', () => {
  const results = rankMatches(candidates('کابل'), 'کابل');
  const names = results.map((row) => row.name);

  // Every "کابل …" product sorts before anything that only mentions a cable in
  // its keywords, and ties keep catalog (id) order.
  const firstNonCable = names.findIndex((name) => !name.startsWith('کابل'));
  if (firstNonCable !== -1) {
    assert.ok(names.slice(0, firstNonCable).every((name) => name.startsWith('کابل')));
  }
  const ids = results.map((row) => row.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
});

test('like patterns wrap every token', () => {
  assert.deepEqual(likePatterns(['شارژر', 'اپل']), ['%شارژر%', '%اپل%']);
  assert.deepEqual(likePatterns([]), []);
});
