// Project-level configuration: the few values that are decisions, not secrets.
//
// Nothing here is a credential. The bot token and the database are provided by
// Telegram Serverless, so there is no API key, password or token in the source.

/**
 * Telegram user IDs allowed to moderate reports and seed the catalog.
 *
 * Empty by default: the bot works for everyone, nobody can moderate. Send
 * `/id` to the bot to learn your own numeric ID, then add it here and deploy.
 * Other people's IDs are personal data — keep them out of a public fork.
 */
export const ADMIN_IDS = [];

/** Plausibility bounds for a single report, in toman. */
export const PRICE_LIMITS = {
  min: 1_000,
  max: 100_000_000,
};

/** Longest accepted value for each free-text field we store. */
export const TEXT_LIMITS = {
  firstName: 64,
  storeName: 60,
  city: 40,
};

/** Products per page in `/products`. */
export const CATALOG_PAGE_SIZE = 6;

/**
 * Search behaviour. Every value is a bound: a query can only ever look at a
 * fixed number of words and a fixed number of rows, however large the catalog
 * grows.
 */
export const SEARCH = {
  /** Longer queries are refused rather than silently truncated. */
  maxQueryLength: 60,
  /** Distinct words that must all match; further words are ignored. */
  maxTokens: 6,
  /** Results shown to the user. */
  results: 8,
  /** Hard cap on rows the database returns for ranking. */
  scanLimit: 60,
};

export function isAdmin(userId) {
  return typeof userId === 'number' && ADMIN_IDS.includes(userId);
}
