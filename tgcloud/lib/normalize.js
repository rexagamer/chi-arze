// The one normalization implementation used for product storage and search.
//
// Every product name is normalized once, when it is seeded (`normalizeText`), and
// every query is normalized the same way, so "آيفون", "آیفون" and "ایفون" are the
// same string. Nothing here is Persian-specific magic: it is a fixed character
// map plus digit folding, which makes it deterministic and trivial to test.
//
// What is deliberately NOT removed: digits and letters. "شارژر ۲۰ وات" and
// "شارژر ۲۵ وات" must stay different products, and so must "۱۰۰۰۰" and "۲۰۰۰۰".

const PERSIAN_ZERO = 0x06f0;
const ARABIC_INDIC_ZERO = 0x0660;

// Characters that read the same to a Persian speaker but are different code
// points. Folded to the Persian form (or dropped when they are decorative).
const CHAR_FOLD = new Map([
  ['\u064A', '\u06CC'], // ي (Arabic yeh)      → ی
  ['\u0649', '\u06CC'], // ى (alef maksura)     → ی
  ['\u0643', '\u06A9'], // ك (Arabic kaf)       → ک
  ['\u06C0', '\u0647'], // ۀ                    → ه
  ['\u0629', '\u0647'], // ة                    → ه
  ['\u0623', '\u0627'], // أ                    → ا
  ['\u0625', '\u0627'], // إ                    → ا
  ['\u0622', '\u0627'], // آ                    → ا
  ['\u0671', '\u0627'], // ٱ                    → ا
  ['\u0624', '\u0648'], // ؤ                    → و
  ['\u0640', ''],       // ـ tatweel: a decorative stretch, no meaning
]);

// Zero-width NON-joiner (U+200C) and zero-width space (U+200B) are word
// separators in Persian — "می‌شود" is two words. They become a space, so the
// joined and separated spellings normalize to the same text.
const ZERO_WIDTH_SEPARATOR = /[\u200B\u200C]/g;

// Joiners, bidi controls and Arabic diacritics (harakat) carry no meaning for
// search and are simply dropped.
const INVISIBLE = /[\u200D-\u200F\u064B-\u0652]/g;

// Thousands separators between digits — Persian "٬", Arabic "،" and the ASCII
// comma. "10,000" and "۱۰٬۰۰۰" must both normalize to "10000", not "10 000",
// so a search for "10000" still matches.
const DIGIT_GROUP_SEPARATOR = /(\d)[,\u066C\u060C](?=\d)/g;

const NOT_LETTER_OR_DIGIT = /[^\p{L}\p{N}]+/gu;

/** ۱۲۳ / ١٢٣ → "123" — users type Persian, Arabic-Indic or Latin digits. */
export function normalizeDigits(value) {
  return String(value ?? '')
    .replace(/[\u06F0-\u06F9]/g, (char) => String(char.charCodeAt(0) - PERSIAN_ZERO))
    .replace(/[\u0660-\u0669]/g, (char) => String(char.charCodeAt(0) - ARABIC_INDIC_ZERO));
}

/**
 * Character-level folding only: digits, Persian/Arabic variants, diacritics,
 * invisible marks, and lowercase. Punctuation is left untouched — parsing a
 * price needs to see its own separators ("1.5", "1,250,000").
 */
export function foldChars(value) {
  const folded = Array.from(normalizeDigits(value), (char) => CHAR_FOLD.get(char) ?? char).join('');
  return folded
    .replace(ZERO_WIDTH_SEPARATOR, ' ')
    .replace(INVISIBLE, '')
    .toLowerCase();
}

/**
 * Full normalization, used for `products.normalized_name`, `products.keywords`
 * and every search query:
 *   1. foldChars — digits latinised, Persian/Arabic variants unified;
 *   2. thousands separators between digits removed ("10,000" → "10000");
 *   3. every other run of punctuation/symbols becomes one space ("USB-C" and
 *      "USB C" both → "usb c", so a hyphen is not a spelling test);
 *   4. repeated whitespace collapsed, ends trimmed.
 */
export function normalizeText(value) {
  return foldChars(value)
    .replace(DIGIT_GROUP_SEPARATOR, '$1')
    .replace(NOT_LETTER_OR_DIGIT, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Split a query into the distinct words that must all match. Capping the count
 * keeps a pathological query from building a huge `AND` clause.
 */
export function tokenize(value, maxTokens = Infinity) {
  const tokens = normalizeText(value).split(' ').filter(Boolean);
  return [...new Set(tokens)].slice(0, maxTokens);
}
