// Parsing and validation for everything a reporter types.
//
// Pure on purpose: no database, no SDK. Anything that needs to look at stored
// data (does the product exist? did they already report this?) lives in
// `reports.js`, and the handler composes the two. Every rejection is an error
// code — `text.js` turns it into Persian — so the rules can be tested exactly.

import { PRICE_LIMITS, TEXT_LIMITS } from './config.js';
import { cleanFreeText, parseToman, priceRangeError, toPositiveInt } from './input.js';
import { normalizeText } from './normalize.js';

export const FIELD_SEPARATOR = '|';

/**
 * Parse `/report <product_id> | <price> | <store> | [url]`.
 *
 * @returns {{ok: true, value: object} | {ok: false, error: string, detail?: any}}
 */
export function parseReportInput(raw) {
  const parts = String(raw ?? '')
    .split(FIELD_SEPARATOR)
    .map((part) => part.trim());

  // A trailing empty field (the optional URL) is not an error, a missing one is.
  while (parts.length > 3 && parts.at(-1) === '') parts.pop();
  if (parts.length < 3) return { ok: false, error: 'USAGE' };
  if (parts.length > 4) return { ok: false, error: 'TOO_MANY_FIELDS' };

  const [productPart, pricePart, storePart, urlPart = ''] = parts;

  const productId = toPositiveInt(productPart);
  if (productId == null) return { ok: false, error: 'PRODUCT_ID_INVALID' };

  const price = parsePrice(pricePart);
  if (!price.ok) return price;

  const store = parseStoreName(storePart);
  if (!store.ok) return store;

  const source = parseSourceUrl(urlPart);
  if (!source.ok) return source;

  return {
    ok: true,
    value: {
      productId,
      priceToman: price.value,
      storeName: store.value,
      sourceUrl: source.value,
    },
  };
}

/**
 * A price in toman, as a whole number.
 *
 * Rejections carry the reason: empty, not a number / not whole toman ("1250.5"),
 * or outside the configured plausibility bounds. Rial is never converted — a
 * value written as rial simply is not a price this bot accepts.
 */
export function parsePrice(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, error: 'PRICE_EMPTY' };

  // `parseToman` already refuses rial amounts, decimals without a multiplier,
  // unsafe integers and anything non-numeric — these branches only say *why*.
  const value = parseToman(text);
  if (value == null) return { ok: false, error: 'PRICE_INVALID', detail: { text } };

  const rangeError = priceRangeError(value);
  if (rangeError) {
    return {
      ok: false,
      error: 'PRICE_OUT_OF_RANGE',
      detail: { value, min: PRICE_LIMITS.min, max: PRICE_LIMITS.max },
    };
  }
  return { ok: true, value };
}

/** A readable store name, kept as typed apart from whitespace and length. */
export function parseStoreName(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, error: 'STORE_EMPTY' };
  if (text.length > TEXT_LIMITS.storeName) {
    return { ok: false, error: 'STORE_TOO_LONG', detail: { max: TEXT_LIMITS.storeName } };
  }

  const name = cleanFreeText(text, TEXT_LIMITS.storeName);
  // Something like "!!!" survives trimming but is not a store name.
  if (!name || normalizeText(name) === '') return { ok: false, error: 'STORE_INVALID' };

  return { ok: true, value: name };
}

/**
 * The optional source link. Shape-checked only — the bot never fetches it, and a
 * link is supporting information, not proof that a price is real.
 */
export function parseSourceUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: true, value: null };
  if (text.length > TEXT_LIMITS.sourceUrl) {
    return { ok: false, error: 'URL_TOO_LONG', detail: { max: TEXT_LIMITS.sourceUrl } };
  }

  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: 'URL_INVALID' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'URL_INVALID' };
  }
  if (!url.hostname) return { ok: false, error: 'URL_INVALID' };

  // Stored canonicalised (lower-cased host, normalised path) but never resolved.
  return { ok: true, value: url.toString() };
}
