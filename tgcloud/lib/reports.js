// Price reports: submission and reading.
//
// Written in raw SQL on purpose. The interesting operations here are an atomic
// per-user rate limit (INSERT … SELECT … WHERE count < limit, one statement) and
// aggregates (COUNT DISTINCT, MIN/MAX) — neither is expressible with the query
// builder, and both must be enforced by the database, not by process memory.
// Raw rows come back unconverted, so `toReport` maps them explicitly.

import { db } from 'sdk';
import { sql } from 'sdk/db';
import { getProductById } from './catalog.js';
import { REPORT_LIMITS, SUMMARY } from './config.js';
import { normalizeText } from './normalize.js';
import { freshness, summarizeApproved } from './summary.js';
import { ensureUser } from './users.js';

const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/** A database row → the shape the rest of the app uses. */
export function toReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    productId: row.product_id,
    userId: row.user_id,
    priceToman: row.price_toman,
    storeName: row.store_name,
    storeKey: row.store_key,
    sourceUrl: row.source_url ?? null,
    status: row.status,
    createdAt: new Date(row.created_at * 1000),
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at * 1000) : null,
    reviewedBy: row.reviewed_by ?? null,
    reviewNote: row.review_note ?? null,
  };
}

function unixSeconds(date) {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Store a report, or explain why it was refused.
 *
 * Order of checks: the user must be identifiable, the product must exist and be
 * active (`reports.js` never trusts an id from the outside), the report must not
 * be a repeat of one from the same person in the last
 * `REPORT_LIMITS.duplicateWindowHours`, and the per-user rate limit must have
 * room.
 *
 * New reports are always `pending`: nothing reaches a price summary until an
 * administrator approves it.
 */
export async function submitReport(from, input, now = new Date()) {
  // Derived here, not passed in: the duplicate key must be the folded form of
  // the name we actually store, whatever the caller supplied.
  const storeKey = normalizeText(input.storeName);

  const user = await ensureUser(from);
  if (!user) return { ok: false, error: 'USER_UNKNOWN' };

  const product = await getProductById(input.productId);
  if (!product) return { ok: false, error: 'PRODUCT_NOT_FOUND' };
  if (!product.isActive) return { ok: false, error: 'PRODUCT_INACTIVE' };

  const duplicateSince = unixSeconds(
    new Date(now.getTime() - REPORT_LIMITS.duplicateWindowHours * SECONDS_PER_HOUR * 1000),
  );
  const duplicate = await db.get(sql`
    SELECT id FROM price_reports
    WHERE user_id = ${user.id}
      AND product_id = ${product.id}
      AND price_toman = ${input.priceToman}
      AND store_key = ${storeKey}
      AND created_at >= ${duplicateSince}
    LIMIT 1
  `);
  if (duplicate) {
    return {
      ok: false,
      error: 'DUPLICATE',
      detail: { reportId: duplicate.id, windowHours: REPORT_LIMITS.duplicateWindowHours },
    };
  }

  const rateSince = unixSeconds(
    new Date(now.getTime() - REPORT_LIMITS.windowHours * SECONDS_PER_HOUR * 1000),
  );

  // One statement, so two simultaneous submissions cannot both slip past the
  // limit: the subquery and the insert see the same database state.
  const inserted = await db.run(sql`
    INSERT INTO price_reports
      (product_id, user_id, price_toman, store_name, store_key, source_url, status)
    SELECT ${product.id}, ${user.id}, ${input.priceToman}, ${input.storeName},
           ${storeKey}, ${input.sourceUrl}, 'pending'
    WHERE (
      SELECT COUNT(*) FROM price_reports
      WHERE user_id = ${user.id} AND created_at >= ${rateSince}
    ) < ${REPORT_LIMITS.perWindow}
    RETURNING id, created_at
  `);

  const row = inserted.rows?.[0];
  if (!row) {
    return {
      ok: false,
      error: 'RATE_LIMITED',
      detail: { limit: REPORT_LIMITS.perWindow, windowHours: REPORT_LIMITS.windowHours },
    };
  }

  return {
    ok: true,
    report: toReport({
      id: row.id,
      product_id: product.id,
      user_id: user.id,
      price_toman: input.priceToman,
      store_name: input.storeName,
      store_key: storeKey,
      source_url: input.sourceUrl,
      status: 'pending',
      created_at: row.created_at,
      reviewed_at: null,
      reviewed_by: null,
      review_note: null,
    }),
    product,
  };
}

/** A single report by id, or null. The id is validated before it is queried. */
export async function getReportById(reportId) {
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const row = await db.get(sql`SELECT * FROM price_reports WHERE id = ${id}`);
  return toReport(row);
}

/**
 * Approved prices for a product, newest first, limited to the recent window.
 * Bounded by both the date filter and `limit` — the full history is never read.
 */
export async function recentApprovedPrices(productId, { now = new Date(), limit = SUMMARY.sampleSize } = {}) {
  const since = unixSeconds(new Date(now.getTime() - SUMMARY.recentDays * SECONDS_PER_DAY * 1000));
  const rows = await db.all(sql`
    SELECT price_toman FROM price_reports
    WHERE product_id = ${productId} AND status = 'approved' AND created_at >= ${since}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  return rows.map((row) => row.price_toman);
}

/**
 * The published view of a product: approved reports only, counted and sampled
 * within the recent window, plus how many reports are still waiting.
 *
 * Rejected reports are never returned. Pending reports are only counted — their
 * prices stay out of every number here.
 */
export async function productPriceSummary(productId, { now = new Date() } = {}) {
  const since = unixSeconds(new Date(now.getTime() - SUMMARY.recentDays * SECONDS_PER_DAY * 1000));

  const rows = await db.all(sql`
    SELECT id, user_id, price_toman, store_name, created_at
    FROM price_reports
    WHERE product_id = ${productId} AND status = 'approved' AND created_at >= ${since}
    ORDER BY created_at DESC
    LIMIT ${SUMMARY.sampleSize}
  `);

  const totals = await db.get(sql`
    SELECT COUNT(*) AS total, COUNT(DISTINCT user_id) AS contributors,
           MAX(created_at) AS latest_at
    FROM price_reports
    WHERE product_id = ${productId} AND status = 'approved' AND created_at >= ${since}
  `);

  const pending = await db.get(sql`
    SELECT COUNT(*) AS pending FROM price_reports
    WHERE product_id = ${productId} AND status = 'pending'
  `);

  const reports = rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    priceToman: row.price_toman,
    storeName: row.store_name,
    createdAt: new Date(row.created_at * 1000),
  }));

  const latestAt = totals?.latest_at ? new Date(totals.latest_at * 1000) : null;

  // The aggregate is authoritative (the sample above is capped), so the rules
  // that depend on counts are re-applied to it — otherwise a capped sample could
  // say "3 contributors" while the same message says "1 report".
  const count = totals?.total ?? reports.length;
  const contributors = totals?.contributors ?? 0;
  const summary = summarizeApproved(reports);

  return {
    ...summary,
    count,
    contributors,
    showMedian: contributors >= SUMMARY.minContributorsForMedian,
    showRange: contributors >= 2 && count >= 2,
    latestAt,
    ...freshness(latestAt, now),
    reports,
    pendingCount: pending?.pending ?? 0,
  };
}

/**
 * Recent approved prices for several products at once, grouped by product — one
 * query for the moderation queue instead of one per report.
 */
export async function approvedPriceSamples(productIds, { now = new Date(), limit = 300 } = {}) {
  const ids = [...new Set(productIds.filter((id) => Number.isInteger(id) && id > 0))];
  const samples = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return samples;

  const since = unixSeconds(new Date(now.getTime() - SUMMARY.recentDays * SECONDS_PER_DAY * 1000));
  // No array binding through `sql`, so the (validated, integer) ids are inlined.
  const idList = sql.raw(ids.join(', '));
  const rows = await db.all(sql`
    SELECT product_id, price_toman FROM price_reports
    WHERE status = 'approved' AND product_id IN (${idList}) AND created_at >= ${since}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);

  for (const row of rows) samples.get(row.product_id)?.push(row.price_toman);
  return samples;
}
