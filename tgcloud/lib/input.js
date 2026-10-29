// Input normalization and validation. Pure functions: handlers decide *what* to
// ask, this module decides *whether the answer is usable* and turns it into the
// value the database stores.

import { PRICE_LIMITS } from './config.js';
import { formatToman } from './format.js';

const PERSIAN_ZERO = 0x06f0;
const ARABIC_INDIC_ZERO = 0x0660;

// Characters that look different but mean the same thing to a Persian reader.
// Folding them is what makes "آيفون" find "آیفون".
const CHAR_FOLD = new Map([
  ['\u064A', '\u06CC'], // ي → ی
  ['\u0649', '\u06CC'], // ى → ی
  ['\u0643', '\u06A9'], // ك → ک
  ['\u0629', '\u0647'], // ة → ه
  ['\u06C0', '\u0647'], // ۀ → ه
  ['\u0623', '\u0627'], // أ → ا
  ['\u0625', '\u0627'], // إ → ا
  ['\u0622', '\u0627'], // آ → ا
  ['\u0671', '\u0627'], // ٱ → ا
  ['\u0624', '\u0648'], // ؤ → و
  ['\u0640', ''],       // ـ tatweel, a decorative stretch
]);

// Zero-width joiners/marks, bidi controls and Arabic diacritics: invisible, but
// they break naive substring matching.
const INVISIBLE = /[\u200B-\u200F\u064B-\u0652]/g;

// "ملیون" is a very common misspelling of "میلیون"; accept both.
const MULTIPLIERS = new Map([
  ['میلیون', 1_000_000],
  ['ملیون', 1_000_000],
  ['هزار', 1_000],
]);

// A number with an optional multiplier word right after it, e.g. "1.5 میلیون".
// The optional group keeps `\s*` inside it: without a multiplier word a number
// must not swallow the whitespace, or "1 250 000" would parse as 1 + 250 + 0.
const AMOUNT = /(\d+(?:\.\d+)?)(?:\s*(میلیون|ملیون|هزار))?/g;
const ONLY_SPACE = /^\s*$/;
const CONJUNCTION = /^\s*و\s*$/; // the "and" in "۲ میلیون و ۳۰۰ هزار"

/** ۱۲۳ / ١٢٣ → "123" — users type Persian or Arabic-Indic digits freely. */
export function normalizeDigits(value) {
  return String(value ?? '')
    .replace(/[\u06F0-\u06F9]/g, (char) => String(char.charCodeAt(0) - PERSIAN_ZERO))
    .replace(/[\u0660-\u0669]/g, (char) => String(char.charCodeAt(0) - ARABIC_INDIC_ZERO));
}

/** Fold a search query (or a catalog entry) into a comparable form. */
export function normalizeSearchText(value) {
  const folded = Array.from(normalizeDigits(value), (char) => CHAR_FOLD.get(char) ?? char).join('');
  return folded.replace(INVISIBLE, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Collapse whitespace for a value we display as-is (store name, city). */
export function cleanFreeText(value, maxLength = Infinity) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

/**
 * Read a price the way a shopper writes it and return whole toman, or null.
 *
 * Accepted: "1250000", "1,250,000", "۱٬۲۵۰٬۰۰۰ تومان", "1.250.000",
 * "۱.۵ میلیون", "۹۵۰ هزار", "۲ میلیون و ۳۰۰ هزار".
 */
export function parseToman(raw) {
  if (raw == null) return null;

  const text = normalizeSearchText(raw)
    .replace(/تومان|تومن/g, '')
    .replace(/\u066B/g, '.') // ٫ — decimal separator
    .replace(/[\u066C\u060C,]/g, '') // ٬ ، , — thousands separators
    // "1.250.000": two or more dot groups can only be thousands, never decimals
    .replace(/\d{1,3}(?:\.\d{3}){2,}/g, (match) => match.replace(/\./g, ''))
    .trim();

  if (!text) return null;

  // Walk the amount expressions and make sure nothing but whitespace and the
  // conjunction "و" sits between them — anything else means this is not a price.
  let total = 0;
  let cursor = 0;
  let previousHadMultiplier = false;

  for (const match of text.matchAll(AMOUNT)) {
    const gap = text.slice(cursor, match.index);
    const joined =
      gap === '' ||
      CONJUNCTION.test(gap) ||
      // "۲ میلیون ۳۰۰ هزار" without "و" is fine; "1 250 000" is not — it would
      // otherwise be read as three amounts instead of a single price.
      (ONLY_SPACE.test(gap) && (cursor === 0 || previousHadMultiplier));
    if (!joined) return null;

    const [expression, numberPart, word] = match;
    const multiplier = MULTIPLIERS.get(word) ?? 1;
    // A bare decimal is a typo, not a price ("1250.5"); with a multiplier it is
    // the normal way to say "۱.۵ میلیون".
    if (multiplier === 1 && numberPart.includes('.')) return null;

    const amount = Math.round(Number(numberPart) * multiplier);
    if (!Number.isSafeInteger(amount)) return null;

    total += amount;
    previousHadMultiplier = word != null;
    cursor = match.index + expression.length;
  }

  if (cursor === 0) return null; // no numbers at all
  if (!ONLY_SPACE.test(text.slice(cursor))) return null;

  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

/** Persian explanation of why an amount is unusable, or null when it is fine. */
export function priceRangeError(amount) {
  if (!Number.isInteger(amount) || amount <= 0) {
    return 'قیمت باید یک عدد صحیح و بزرگ‌تر از صفر باشد.';
  }
  if (amount < PRICE_LIMITS.min) {
    return `کم‌ترین قیمتی که می‌شود ثبت کرد ${formatToman(PRICE_LIMITS.min)} است.`;
  }
  if (amount > PRICE_LIMITS.max) {
    return `بیش‌ترین قیمتی که می‌شود ثبت کرد ${formatToman(PRICE_LIMITS.max)} است.`;
  }
  return null;
}
