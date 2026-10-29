// Project-level configuration: the few values that are decisions, not secrets.
//
// Nothing here is a credential. The bot token and the database are provided by
// Telegram Serverless, so there is no API key, password or token in the source.

/**
 * Telegram user IDs allowed to moderate reports.
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

/** Longest accepted free-text value for a report's store/city field. */
export const TEXT_LIMITS = {
  storeName: 60,
  city: 40,
};

/** How far back a report still counts as "recent" when showing prices. */
export const RECENT_WINDOW_DAYS = 30;

/** Reports per page in the product/report lists. */
export const PAGE_SIZE = 5;

export function isAdmin(userId) {
  return typeof userId === 'number' && ADMIN_IDS.includes(userId);
}
