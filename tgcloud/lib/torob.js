// The Torob integration: cache, then client, then parser — in that order.
//
// One public shape per user action (`searchOffers`, `sellerOffers`) returning
// `{ ok: true, … }` or `{ ok: false, error }`. Nothing above this module knows
// that caching exists, and nothing below it knows that Telegram does.
//
// The cache is a table, not memory: serverless invocations share nothing else,
// and a module-level `Map` would be empty on the next update. Rows are small,
// keyed by the normalized query, and only live for `TOROB.cacheTtlMinutes`.
// Failures are never cached — a timeout must not become ten minutes of timeout.

import { db } from 'sdk';
import { sql } from 'sdk/db';
import { TOROB } from './config.js';
import { normalizeText } from './normalize.js';
import { getJson, searchUrl, sellersUrl } from './torob-client.js';
import { isProductKey, parseSearchResponse, parseSellersResponse } from './torob-parse.js';

const SECONDS_PER_MINUTE = 60;

/** The cache key for a query: folded, so "شارژر  سامسونگ" and "شارژر سامسونگ" share one row. */
export function searchCacheKey(query) {
  return `search:${normalizeText(query)}`;
}

export function sellersCacheKey(prk) {
  return `sellers:${prk}`;
}

/** Cached payload, or null when missing, stale, or the cache itself is unusable. */
async function readCache(cacheKey, now) {
  const cutoff = Math.floor(now.getTime() / 1000) - TOROB.cacheTtlMinutes * SECONDS_PER_MINUTE;
  try {
    const row = await db.get(sql`
      SELECT payload, fetched_at FROM torob_cache
      WHERE cache_key = ${cacheKey} AND fetched_at >= ${cutoff}
    `);
    if (!row) return null;
    return { payload: JSON.parse(row.payload), fetchedAt: new Date(row.fetched_at * 1000) };
  } catch (error) {
    // A missing table (schema not migrated) or any storage problem must not take
    // search down with it: the bot simply goes to Torob every time.
    console.warn('torob cache read failed', error?.message ?? String(error));
    return null;
  }
}

/** Store a successful payload. Best effort — a cache write is never fatal. */
async function writeCache(cacheKey, payload) {
  try {
    await db.run(sql`
      INSERT INTO torob_cache (cache_key, payload) VALUES (${cacheKey}, ${JSON.stringify(payload)})
      ON CONFLICT (cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = unixepoch()
    `);
  } catch (error) {
    console.warn('torob cache write failed', error?.message ?? String(error));
  }
}

/**
 * Search Torob.
 *
 * Returns the shaped result plus `cached`/`fetchedAt` so the view can say the
 * numbers are a few minutes old instead of implying they are live.
 */
export async function searchOffers(query, { now = new Date() } = {}) {
  const cacheKey = searchCacheKey(query);

  const hit = await readCache(cacheKey, now);
  if (hit) return { ok: true, ...hit.payload, cached: true, fetchedAt: hit.fetchedAt };

  const response = await getJson(searchUrl(query, { size: TOROB.requestSize }));
  if (!response.ok) return { ok: false, error: response.error };

  const parsed = parseSearchResponse(response.payload);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const payload = {
    products: parsed.products.slice(0, TOROB.resultsShown),
    totalCount: parsed.totalCount,
    correctedQuery: parsed.correctedQuery,
    query,
  };
  await writeCache(cacheKey, payload);

  return { ok: true, ...payload, cached: false, fetchedAt: now };
}

/**
 * The shops selling one product, cheapest first.
 *
 * The upstream answer for a popular product is several megabytes (every seller
 * with their shipping blurb), so only the first few offers are kept — and only
 * those are cached. A product nobody can price still answers, with an empty list.
 */
export async function sellerOffers(prk, { now = new Date() } = {}) {
  if (!isProductKey(prk)) return { ok: false, error: 'BAD_PRODUCT_KEY' };

  const cacheKey = sellersCacheKey(prk);
  const hit = await readCache(cacheKey, now);
  if (hit) return { ok: true, ...hit.payload, cached: true, fetchedAt: hit.fetchedAt };

  const response = await getJson(sellersUrl(prk));
  if (!response.ok) return { ok: false, error: response.error };

  const parsed = parseSellersResponse(response.payload);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const payload = {
    prk,
    offers: parsed.offers.slice(0, TOROB.sellersShown),
    count: parsed.count,
    totalOffers: parsed.offers.length,
  };
  await writeCache(cacheKey, payload);

  return { ok: true, ...payload, cached: false, fetchedAt: now };
}
