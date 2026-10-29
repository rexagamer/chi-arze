// Moderation: the pending queue, the two decisions, and user flags.
//
// Authorisation is *not* here — handlers check `isAdmin` before calling in, and
// these functions only do what they are told. What they do enforce is state:
// a decision is a single UPDATE guarded by `status = 'pending'`, so a report can
// never be approved twice, approved after rejection, or changed by two
// administrators racing each other.

import { db } from 'sdk';
import { sql } from 'sdk/db';
import { SUMMARY, TEXT_LIMITS } from './config.js';
import { cleanFreeText } from './input.js';
import { getReportById, toReport } from './reports.js';

/**
 * The moderation queue, oldest first, with the product name and flag count.
 * Bounded like every other list in the bot.
 */
export async function listPendingReports({ limit = SUMMARY.pendingPageSize, offset = 0 } = {}) {
  const rows = await db.all(sql`
    SELECT r.id, r.product_id, r.user_id, r.price_toman, r.store_name, r.store_key,
           r.source_url, r.status, r.created_at, r.reviewed_at, r.reviewed_by, r.review_note,
           p.name AS product_name,
           (SELECT COUNT(*) FROM report_flags f WHERE f.report_id = r.id) AS flag_count
    FROM price_reports r
    JOIN products p ON p.id = r.product_id
    WHERE r.status = 'pending'
    ORDER BY r.created_at ASC, r.id ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  return rows.map((row) => ({
    ...toReport(row),
    productName: row.product_name,
    flagCount: row.flag_count,
  }));
}

/** How many reports are waiting for a decision. */
export async function countPendingReports() {
  const row = await db.get(sql`SELECT COUNT(*) AS n FROM price_reports WHERE status = 'pending'`);
  return row?.n ?? 0;
}

/**
 * Approve a pending report. Only `pending → approved` is possible: the guard is
 * in the WHERE clause, so a stale button or a repeated command cannot re-decide
 * anything.
 */
export async function approveReport(reportId, reviewerTgId) {
  return decide(reportId, 'approved', reviewerTgId, null);
}

/** Reject a pending report, optionally with a reason the author could be shown. */
export async function rejectReport(reportId, reviewerTgId, note) {
  const cleanNote = cleanFreeText(note, TEXT_LIMITS.reviewNote);
  return decide(reportId, 'rejected', reviewerTgId, cleanNote);
}

async function decide(reportId, status, reviewerTgId, note) {
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'REPORT_ID_INVALID' };
  if (!Number.isInteger(reviewerTgId)) return { ok: false, error: 'REVIEWER_INVALID' };

  // `unixepoch()` rather than a JS timestamp: the database is the clock that
  // stamped `created_at`, so reviewed_at stays comparable with it.
  const result = await db.run(sql`
    UPDATE price_reports
    SET status = ${status}, reviewed_at = unixepoch(), reviewed_by = ${reviewerTgId},
        review_note = ${note}
    WHERE id = ${id} AND status = 'pending'
    RETURNING id, status, reviewed_at
  `);

  const row = result.rows?.[0];
  if (row) return { ok: true, report: { id: row.id, status: row.status } };

  // Nothing changed: say precisely why, without pretending it is an error in
  // the caller's input when the report simply does not exist.
  const existing = await getReportById(id);
  if (!existing) return { ok: false, error: 'REPORT_NOT_FOUND' };
  return { ok: false, error: 'INVALID_STATE', status: existing.status };
}

/** Everything an administrator needs about one report, including its flags. */
export async function inspectReport(reportId) {
  const report = await getReportById(reportId);
  if (!report) return null;

  const product = await db.get(
    sql`SELECT id, name, category, is_active FROM products WHERE id = ${report.productId}`,
  );
  const flags = await db.all(sql`
    SELECT created_at FROM report_flags WHERE report_id = ${report.id} ORDER BY created_at DESC
  `);

  return {
    report,
    product: product
      ? { id: product.id, name: product.name, category: product.category, isActive: !!product.is_active }
      : null,
    flags: flags.map((row) => new Date(row.created_at * 1000)),
  };
}

/**
 * Flag a report as suspicious.
 *
 * Only published (approved) reports can be flagged — the ones a user can
 * actually see — and never by their own author. The UNIQUE (report_id, user_id)
 * index is what really prevents duplicates; the INSERT relies on it instead of a
 * check-then-write that two taps could both pass.
 *
 * A flag is a signal for a human, never an automatic rejection.
 */
export async function flagReport(reportId, userId) {
  const id = Number(reportId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'REPORT_ID_INVALID' };
  if (!Number.isInteger(userId)) return { ok: false, error: 'USER_UNKNOWN' };

  const report = await getReportById(id);
  if (!report) return { ok: false, error: 'REPORT_NOT_FOUND' };
  if (report.status !== 'approved') return { ok: false, error: 'REPORT_NOT_PUBLIC' };
  if (report.userId === userId) return { ok: false, error: 'SELF_FLAG' };

  const inserted = await db.run(sql`
    INSERT INTO report_flags (report_id, user_id) VALUES (${id}, ${userId})
    ON CONFLICT (report_id, user_id) DO NOTHING
    RETURNING id
  `);
  if (!inserted.rows?.length) return { ok: false, error: 'ALREADY_FLAGGED' };

  return { ok: true, flagCount: await countFlags(id) };
}

/** Distinct users who flagged a report. */
export async function countFlags(reportId) {
  const row = await db.get(
    sql`SELECT COUNT(*) AS n FROM report_flags WHERE report_id = ${reportId}`,
  );
  return row?.n ?? 0;
}

/** The numbers on the `/admin` screen. */
export async function moderationStats() {
  const byStatus = await db.all(sql`
    SELECT status, COUNT(*) AS n FROM price_reports GROUP BY status
  `);
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const row of byStatus) {
    if (row.status in counts) counts[row.status] = row.n;
  }

  const flagged = await db.get(sql`
    SELECT COUNT(DISTINCT report_id) AS reports, COUNT(*) AS flags FROM report_flags
  `);

  return { ...counts, flaggedReports: flagged?.reports ?? 0, flags: flagged?.flags ?? 0 };
}
