// Input parsing and validation. Pure functions: handlers decide *what* to ask,
// this module decides *whether the answer is usable* and turns it into the value
// the database stores.
//
// Character folding, digit folding and whitespace collapsing live in
// `normalize.js` and are reused here — this file only adds the rules that are
// specific to prices and identifiers.

import { PRICE_LIMITS } from './config.js';
import { foldChars, normalizeDigits } from './normalize.js';

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

/**
 * Read a price the way a shopper writes it and return whole toman, or null.
 *
 * Accepted: "1250000", "1,250,000", "۱٬۲۵۰٬۰۰۰ تومان", "1.250.000",
 * "۱.۵ میلیون", "۹۵۰ هزار", "۲ میلیون و ۳۰۰ هزار".
 * Rejected rather than guessed: rial amounts, decimals without a multiplier
 * ("1250.5"), spaced digit groups ("1 250 000"), and anything non-numeric.
 */
export function parseToman(raw) {
  if (raw == null) return null;

  const text = foldChars(raw)
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

/**
 * Is this a price the bot is willing to store? Whole toman, positive, and inside
 * the configured bounds. The wording of the refusal lives in `text.js` — this is
 * the rule, not the message.
 */
export function isPriceWithinLimits(amount) {
  return (
    Number.isInteger(amount) &&
    amount > 0 &&
    amount >= PRICE_LIMITS.min &&
    amount <= PRICE_LIMITS.max
  );
}

const ALL_DIGITS = /^\d+$/;

/**
 * A database id from user input ("12", "۱۲", 12) as a positive integer, or null.
 * Used wherever an id arrives from outside — callback data, command arguments —
 * so a malformed value never reaches a query.
 *
 * The whole string must be digits: `parseInt` alone would read "12abc" and
 * "12.5" as 12, which is a silently different id from the one the user meant.
 */
export function toPositiveInt(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  const text = normalizeDigits(String(value ?? '')).trim();
  if (!ALL_DIGITS.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Collapse whitespace for a value we display as-is (store name, city). */
export function cleanFreeText(value, maxLength = Infinity) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}
