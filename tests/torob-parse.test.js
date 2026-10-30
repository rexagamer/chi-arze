// The Torob parser, against captured payloads.
//
// `torob-search-charger.json` and `torob-sellers-charger.json` are trimmed copies
// of real responses (see each file's `_note`). The rest are derived edge cases:
// they exist to prove the guards, not to describe Torob's behaviour.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  isProductKey,
  parseSearchResponse,
  parseSellersResponse,
  parseShopText,
  productPageUrl,
  toToman,
} from '../tgcloud/lib/torob-parse.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const realSearch = fixture('torob-search-charger.json');
const realSellers = fixture('torob-sellers-charger.json');
const edge = fixture('torob-edge-cases.json');

test('a real search response parses into products with prices, shops and links', () => {
  const result = parseSearchResponse(realSearch);

  assert.equal(result.ok, true);
  assert.equal(result.products.length, 4);
  assert.equal(result.totalCount, 1200);
  assert.equal(result.correctedQuery, null);

  const [first] = result.products;
  assert.equal(first.prk, 'ec705a97-bdcb-4786-86c1-539b1a1361b9');
  assert.match(first.name, /شارژر سامسونگ/);
  assert.equal(first.priceToman, 3_452_000); // toman, exactly as Torob sent it
  assert.equal(first.shopName, 'ایران تاجیر'); // a single-shop product
  assert.equal(first.shopCount, null);
  assert.equal(first.url, 'https://torob.com/p/ec705a97-bdcb-4786-86c1-539b1a1361b9/');
  assert.equal(first.isAd, true);
});

test('a multi-shop product reports the shop count instead of a shop name', () => {
  const multi = parseSearchResponse(realSearch).products[1];

  assert.equal(multi.priceToman, 1_388_800);
  assert.equal(multi.shopCount, 730);
  assert.equal(multi.shopName, null);
  assert.equal(multi.isAd, false);
});

test('an empty result set is a valid answer, not an error', () => {
  const result = parseSearchResponse(edge.empty);
  assert.deepEqual(result, { ok: true, products: [], totalCount: 0, correctedQuery: null });
});

test('a response without results, or with results of the wrong type, is an unexpected shape', () => {
  assert.equal(parseSearchResponse(edge.no_results_key).error, 'UNEXPECTED_SHAPE');
  assert.equal(parseSearchResponse(edge.results_not_an_array).error, 'UNEXPECTED_SHAPE');
  assert.equal(parseSearchResponse(edge.not_an_object).error, 'UNEXPECTED_SHAPE');
  assert.equal(parseSearchResponse(null).error, 'UNEXPECTED_SHAPE');
  assert.equal(parseSearchResponse('{}').error, 'UNEXPECTED_SHAPE');
});

test('rows missing a real key or a name are dropped, not rendered as blanks', () => {
  const { products } = parseSearchResponse(edge.rows_missing_essentials);

  // Kept: a row with a key and a name but no price.
  assert.equal(products.length, 1);
  assert.equal(products[0].prk, '864a937e-1cf5-48c1-a64a-20d11537bdd4');
  assert.equal(products[0].priceToman, null);
  assert.equal(products[0].shopCount, 3);
});

test('prices that are not a positive whole number become "unknown", never zero', () => {
  assert.equal(toToman(0), null); // 0 is Torob's "no usable price", not "free"
  assert.equal(toToman(null), null);
  assert.equal(toToman(undefined), null);
  assert.equal(toToman(''), null);
  assert.equal(toToman('cheap'), null);
  assert.equal(toToman(-5), null);
  assert.equal(toToman(1_388_800), 1_388_800);
  assert.equal(toToman('3452000'), 3_452_000); // a numeric string is fine
  assert.equal(toToman(347_000.4), 347_000); // rounded to whole toman

  const { products } = parseSearchResponse(edge.price_variants);
  assert.deepEqual(
    products.map((product) => product.priceToman),
    [null, 3_452_000, 347_000, null],
  );
});

test('shop_text distinguishes a count from a shop name and ignores odd shapes', () => {
  assert.deepEqual(parseShopText('در ۷۳۰ فروشگاه'), { shopCount: 730, shopName: null });
  assert.deepEqual(parseShopText('در ایران تاجیر'), { shopCount: null, shopName: 'ایران تاجیر' });
  assert.deepEqual(parseShopText('در ۳ فروشگاه'), { shopCount: 3, shopName: null });
  assert.deepEqual(parseShopText(''), { shopCount: null, shopName: null });
  assert.deepEqual(parseShopText(null), { shopCount: null, shopName: null });
  // A shape we do not recognise is passed through as a name, not dropped.
  assert.deepEqual(parseShopText('۷۳۰ فروشگاه'), { shopCount: null, shopName: '۷۳۰ فروشگاه' });

  const variants = parseSearchResponse(edge.shop_text_variants).products;
  assert.deepEqual(
    variants.map((product) => [product.shopCount, product.shopName]),
    [
      [730, null],
      [null, 'ایران تاجیر'],
      [null, null],
      [null, '۷۳۰ فروشگاه'],
    ],
  );
});

test('the same product twice (ad slot plus organic slot) is kept once', () => {
  const { products } = parseSearchResponse(edge.duplicate_products);
  assert.equal(products.length, 1);
  assert.equal(products[0].isAd, true); // the first occurrence wins
});

test('a spell-checked query is reported so the view can suggest it', () => {
  const result = parseSearchResponse(edge.spellchecked);
  assert.equal(result.correctedQuery, 'شارژر');
});

test('product keys are UUIDs and nothing else', () => {
  assert.equal(isProductKey('d92e497e-52aa-4f6e-ba9e-26664ae2368f'), true);
  assert.equal(isProductKey('D92E497E-52AA-4F6E-BA9E-26664AE2368F'), true);
  assert.equal(isProductKey('not-a-uuid'), false);
  assert.equal(isProductKey('../../etc/passwd'), false);
  assert.equal(isProductKey(null), false);
  assert.equal(productPageUrl('not-a-uuid'), null);
  assert.equal(
    productPageUrl('d92e497e-52aa-4f6e-ba9e-26664ae2368f'),
    'https://torob.com/p/d92e497e-52aa-4f6e-ba9e-26664ae2368f/',
  );
});

test('a real sellers response parses into named shops, cheapest first', () => {
  const result = parseSellersResponse(realSellers);

  assert.equal(result.ok, true);
  assert.equal(result.offers.length, 5);
  assert.equal(result.count, 326);

  const cheapest = result.offers[0];
  assert.equal(cheapest.priceToman, 1_388_800);
  assert.equal(cheapest.shopName, 'پخش پاسارگاد');
  assert.equal(cheapest.city, 'الوند');
  assert.equal(cheapest.available, true);
  assert.equal(cheapest.priceUnreliable, false);
  assert.equal(cheapest.isAd, false);

  // Every shop in the fixture is a real name — nothing is synthesised.
  assert.deepEqual(
    result.offers.map((offer) => offer.shopName),
    ['پخش پاسارگاد', 'جان جانبی قسطی', 'مسترفون بندرعباس', 'زن ویکس', 'بازرگانی هوش مصنوعی کیوی'],
  );
});

test('a seller flagged as unreliable keeps the flag instead of losing the row', () => {
  const unreliable = parseSellersResponse(realSellers).offers.find(
    (offer) => offer.shopName === 'بازرگانی هوش مصنوعی کیوی',
  );
  assert.equal(unreliable.priceUnreliable, true);
  assert.equal(unreliable.ageText, '۱ ماه و ۲ روز پیش');
});

test('seller rows without a shop name are dropped; unavailable shops are kept', () => {
  const { offers } = parseSellersResponse(edge.sellers.missing_shop_name);

  assert.equal(offers.length, 1);
  assert.equal(offers[0].shopName, 'فروشگاه واقعی');
  assert.equal(offers[0].available, false);
});

test('duplicate shop+price offers collapse; the same shop at another price stays', () => {
  const { offers } = parseSellersResponse(edge.sellers.duplicates);
  assert.deepEqual(
    offers.map((offer) => offer.priceToman),
    [5000, 6000],
  );
});

test('offers without a price are listed last, not first', () => {
  const { offers } = parseSellersResponse(edge.sellers.prices);
  assert.deepEqual(
    offers.map((offer) => offer.shopName),
    ['ارزان', 'گران', 'بی‌قیمت'],
  );
});

test('an empty sellers response is valid; a broken one is an unexpected shape', () => {
  assert.deepEqual(parseSellersResponse(edge.sellers.empty), { ok: true, offers: [], count: 0 });
  assert.equal(parseSellersResponse({ results: null }).error, 'UNEXPECTED_SHAPE');
  assert.equal(parseSellersResponse({}).error, 'UNEXPECTED_SHAPE');
});
