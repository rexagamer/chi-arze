import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  allProducts,
  categoryLabel,
  getProduct,
  searchProducts,
} from '../tgcloud/lib/catalog.js';

test('every catalog entry has a unique key and a labelled category', () => {
  const products = allProducts();
  const keys = products.map((product) => product.key);

  assert.equal(new Set(keys).size, keys.length);
  for (const product of products) {
    assert.ok(product.name.length > 0, `${product.key} needs a name`);
    assert.notEqual(categoryLabel(product.category), product.category, `${product.key} has an unknown category`);
  }
});

test('getProduct resolves by key and ignores anything else', () => {
  assert.equal(getProduct('apple-airpods-pro-2').name, 'ایرپاد پرو ۲ اپل');
  assert.equal(getProduct('no-such-product'), null);
});

test('searchProducts matches names, aliases, brands and categories', () => {
  assert.deepEqual(searchProducts('ایرپاد').map((product) => product.key), ['apple-airpods-pro-2']);
  assert.ok(searchProducts('انکر').length > 0);
  assert.ok(searchProducts('پاوربانک').every((product) => product.category === 'powerbank'));
  assert.deepEqual(searchProducts(''), []);
});

test('searchProducts normalises digits and Arabic spelling of ی/ک', () => {
  assert.ok(searchProducts('۲۰ وات').length > 0);
  assert.deepEqual(
    searchProducts('آيفون ۱۵').map((product) => product.key),
    searchProducts('ایفون 15').map((product) => product.key),
  );
});

test('searchProducts honours the result limit', () => {
  assert.equal(searchProducts('انکر', 1).length, 1);
});
