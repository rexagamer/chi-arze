// Parsing Torob's public web responses into the small shape this bot renders.
//
// Pure on purpose: no `fetch`, no database, so every rule here is testable
// against captured payloads (`tests/fixtures/torob-*.json`). `torob.js` does the
// HTTP and the caching; this file only decides what a response *means*.
//
// The shapes below were taken from real responses, not from documentation —
// Torob has no public search API. Two properties of the real data drive every
// decision here:
//
//   * `products_info`/`results` is a list of arbitrary length that may contain
//     ads, duplicate products and rows missing the fields we need;
//   * `price` is a whole number of **toman** (verified: a row with
//     `price: 3452000` carried `price_text: "۳٫۴۵۲٫۰۰۰ تومان"`).
//
// So: every field is read defensively, malformed rows are dropped rather than
// rendered as blanks, and nothing is ever invented to fill a gap.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A Torob product key (`prk` / `random_key`) is a UUID. Anything else is junk. */
export function isProductKey(value) {
  return typeof value === 'string' && UUID.test(value);
}

/** The public product page for a key — the shape Torob itself links to. */
export function productPageUrl(prk) {
  return isProductKey(prk) ? `https://torob.com/p/${prk}/` : null;
}

/**
 * A price in whole toman, or null.
 *
 * `price` is sometimes absent, 0, a string, or a float. 0 is not "free": Torob
 * uses 0/absent for "no usable price", so it is reported as unknown instead of
 * being shown as a price of zero.
 */
export function toToman(price) {
  const value = typeof price === 'string' && price.trim() !== '' ? Number(price) : price;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

/**
 * `shop_text` is Torob's one-line shop summary and comes in two shapes:
 *   "در ۷۳۰ فروشگاه"      → how many shops sell it
 *   "در ایران تاجیر"      → the single shop's name
 * Both are shown as-is (the bot does not reformat Persian numerals it did not
 * produce), but they are separated so the view can label them correctly.
 */
export function parseShopText(shopText) {
  if (typeof shopText !== 'string') return { shopCount: null, shopName: null };

  const text = shopText.trim();
  if (!text.startsWith('در ')) return { shopCount: null, shopName: text || null };

  const rest = text.slice(3).trim();
  const countMatch = rest.match(/^([۰-۹0-9٠-٩]+)\s+فروشگاه$/);
  if (countMatch) return { shopCount: toPersianInt(countMatch[1]), shopName: null };

  return { shopCount: null, shopName: rest || null };
}

/** "۷۳۰" / "٧٣٠" → 730. Used only for the count in `shop_text`. */
function toPersianInt(text) {
  const latin = text
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
  const value = Number(latin);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * One search row → a product the bot can show, or null when the row is unusable.
 *
 * A row is kept only if it has a real key (needed for the link and for opening
 * its sellers) and a name. Everything else — price, shops, ad marker — is
 * optional and is simply left undefined when Torob did not send it.
 */
export function toProductRow(row) {
  if (!row || typeof row !== 'object') return null;

  const prk = row.random_key;
  if (!isProductKey(prk)) return null;

  const name = cleanText(row.name1) ?? cleanText(row.name2);
  if (!name) return null;

  const { shopCount, shopName } = parseShopText(row.shop_text);

  return {
    prk,
    name,
    nameEn: cleanText(row.name2) ?? null,
    priceToman: toToman(row.price),
    shopCount,
    shopName,
    url: productPageUrl(prk),
    isAd: row.is_adv === true,
    imageUrl: cleanText(row.image_url) ?? null,
  };
}

/** Collapse whitespace; drop empty strings so `??` chains work. */
function cleanText(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text || null;
}

/**
 * A search response → `{ products, totalCount, correctedQuery }`.
 *
 * `results` may be absent, null, or not an array at all if the upstream shape
 * changes: that is reported as an unexpected shape, never as "no results", so
 * the user is told the truth about why nothing is shown.
 */
export function parseSearchResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'UNEXPECTED_SHAPE' };
  }
  if (!Array.isArray(payload.results)) {
    return { ok: false, error: 'UNEXPECTED_SHAPE' };
  }

  const seen = new Set();
  const products = [];
  for (const row of payload.results) {
    const product = toProductRow(row);
    if (!product) continue;
    // The same product can come back twice (an ad slot and an organic slot).
    if (seen.has(product.prk)) continue;
    seen.add(product.prk);
    products.push(product);
  }

  const spellcheck = payload.spellcheck;
  return {
    ok: true,
    products,
    totalCount: Number.isSafeInteger(payload.count) ? payload.count : null,
    correctedQuery:
      spellcheck?.is_spellchecked === true ? cleanText(spellcheck.corrected_query) : null,
  };
}

/**
 * One seller row → an offer, or null.
 *
 * The sellers endpoint returns the same product from every shop that carries
 * it: `shop_name` plus `price`. `availability: false` is kept (the caller
 * decides whether to show it) rather than silently dropped, because "out of
 * stock everywhere" is information too.
 */
export function toSellerRow(row) {
  if (!row || typeof row !== 'object') return null;

  const shopName = cleanText(row.shop_name);
  if (!shopName) return null;

  return {
    offerKey: isProductKey(row.prk) ? row.prk : null,
    shopName,
    city: cleanText(row.shop_name2) ?? null,
    priceToman: toToman(row.price),
    available: row.availability !== false,
    // Torob's own warning that the price cannot be trusted. Passed through.
    priceUnreliable: row.is_price_unreliable === true,
    isAd: row.is_adv === true,
    ageText: cleanText(row.last_price_change_date) ?? null,
  };
}

/**
 * A sellers response → `{ offers, count }`, cheapest first.
 *
 * Offers without a price are kept last (they are still shops that list it), and
 * an offer that repeats the same shop at the same price is dropped — the
 * endpoint lists one row per listing, which occasionally duplicates.
 */
export function parseSellersResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'UNEXPECTED_SHAPE' };
  }
  if (!Array.isArray(payload.results)) {
    return { ok: false, error: 'UNEXPECTED_SHAPE' };
  }

  const seen = new Set();
  const offers = [];
  for (const row of payload.results) {
    const offer = toSellerRow(row);
    if (!offer) continue;
    const key = `${offer.shopName}|${offer.priceToman}`;
    if (seen.has(key)) continue;
    seen.add(key);
    offers.push(offer);
  }

  offers.sort((left, right) => {
    if (left.priceToman == null) return right.priceToman == null ? 0 : 1;
    if (right.priceToman == null) return -1;
    return left.priceToman - right.priceToman;
  });

  return {
    ok: true,
    offers,
    count: Number.isSafeInteger(payload.count) ? payload.count : offers.length,
  };
}
