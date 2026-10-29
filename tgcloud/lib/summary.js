// Statistics and honesty rules for price summaries. Pure functions: they take
// rows and return numbers and flags, and `text.js` decides how to say it.
//
// The rules exist to keep the bot from implying more certainty than the data
// has: a median needs several *different* people, old data is marked old, and a
// sample that is too small produces no comparison at all.

import { OUTLIER, SUMMARY } from './config.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Median of whole-toman prices, or null for an empty set. */
export function median(prices) {
  if (!prices.length) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  // Even count: the mean of the two middle values, rounded to whole toman.
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** How many distinct people wrote these rows. */
export function countContributors(rows) {
  return new Set(rows.map((row) => row.userId)).size;
}

/**
 * Everything a product page may state about approved prices.
 *
 * `rows` are approved reports already limited to the recent window; `pending`
 * is counted separately and is never mixed into the numbers.
 */
export function summarizeApproved(rows) {
  const prices = rows.map((row) => row.priceToman);
  const contributors = countContributors(rows);

  return {
    count: rows.length,
    contributors,
    median: median(prices),
    min: prices.length ? Math.min(...prices) : null,
    max: prices.length ? Math.max(...prices) : null,
    // A median is only meaningful with several independent reports; one person
    // reporting twice is not market evidence.
    showMedian: contributors >= SUMMARY.minContributorsForMedian,
    // A range from a single contributor is just that person's number.
    showRange: contributors >= 2 && prices.length >= 2,
  };
}

/** Age of the newest approved report, plus whether it is too old to rely on. */
export function freshness(latestAt, now = new Date()) {
  if (!latestAt) return { days: null, isStale: true };
  const days = Math.max(0, Math.floor((now.getTime() - new Date(latestAt).getTime()) / DAY_MS));
  return { days, isStale: days > SUMMARY.staleAfterDays };
}

/** The cutoff before which an approved report is no longer "recent". */
export function recentWindowStart(now = new Date(), days = SUMMARY.recentDays) {
  return new Date(now.getTime() - days * DAY_MS);
}

/**
 * Compare one price with the recent approved prices for the same product.
 *
 * Returns null when there is not enough data — a "warning" computed from two
 * reports would be noise dressed up as knowledge. The result is only ever shown
 * to an administrator (and to the reporter as a heads-up); it never changes a
 * status by itself.
 */
export function priceDeviation(price, samplePrices) {
  const sample = samplePrices.filter((value) => Number.isFinite(value) && value > 0);
  if (sample.length < OUTLIER.minSample) return null;

  const typical = median(sample);
  if (!typical) return null;

  const ratio = Math.abs(price - typical) / typical;
  return {
    median: typical,
    ratio,
    isUnusual: ratio >= OUTLIER.deviationRatio,
    sampleSize: sample.length,
  };
}
