// Project-level configuration: the few values that are decisions, not secrets.
//
// Nothing here is a credential. The bot token and the database are provided by
// Telegram Serverless, so there is no API key, password or token in the source.

/**
 * Telegram user IDs allowed to moderate reports and seed the catalog.
 *
 * This is the allowlist: only numeric Telegram IDs are ever checked (never a
 * username or first name, both of which a user can change). Empty by default —
 * the bot works for everyone and nobody can moderate until an ID is added here.
 *
 * Send `/id` to the bot to get your own ID, put it in this array, and redeploy
 * (`npm run deploy`). See README → "Become an administrator".
 */
export const ADMIN_IDS = [];

/** Plausibility bounds for a single report, in toman. The unit is never rial. */
export const PRICE_LIMITS = {
  min: 1_000,
  max: 100_000_000,
};

/** Longest accepted value for each free-text field we store. */
export const TEXT_LIMITS = {
  firstName: 64,
  storeName: 60,
  sourceUrl: 200,
  reviewNote: 200,
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

/** Submission rules, enforced against the database (not process memory). */
export const REPORT_LIMITS = {
  /** Reports one user may submit inside `windowHours`. */
  perWindow: 5,
  /** Rolling window for the per-user rate limit, in hours. */
  windowHours: 24,
  /**
   * The same user reporting the same price for the same product at the same
   * store inside this window is a duplicate. After it passes, they may report
   * that price again — prices legitimately repeat over time.
   */
  duplicateWindowHours: 24,
};

/**
 * How price summaries are built. Every rule that decides what is shown lives
 * here, so the bot's honesty is a configuration question, not a code change.
 */
export const SUMMARY = {
  /** Approved reports older than this are not counted (they are not "current"). */
  recentDays: 90,
  /** Most approved rows fetched for a median / sample; never the whole history. */
  sampleSize: 50,
  /** A median is only shown when this many distinct people reported. */
  minContributorsForMedian: 3,
  /** "This data is getting old" threshold, counted from the newest report. */
  staleAfterDays: 30,
  /** Approved reports listed under a product. */
  recentReportsShown: 5,
  /** Pending reports listed in the admin queue. */
  pendingPageSize: 5,
};

/**
 * Outlier hint for administrators. Deliberately weak: it only ever adds a
 * warning, never changes a report's status, and stays silent on small samples.
 */
export const OUTLIER = {
  /** Below this many approved reports, no comparison is made at all. */
  minSample: 5,
  /** A price this far from the median (as a fraction, e.g. 0.5 = 50%) is flagged. */
  deviationRatio: 0.5,
};

export function isAdmin(userId) {
  return typeof userId === 'number' && ADMIN_IDS.includes(userId);
}
