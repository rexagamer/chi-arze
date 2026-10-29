// tgcloud/schema.js — the bot's database. Tables are named exports; the platform
// discovers them here and `npx tgcloud migrate` applies changes.
//
// Conventions for this project:
// - Money is stored as a whole number of toman (`price_toman`), never as a float
//   and never in rial, so formatting and comparisons stay exact.
// - There are no foreign keys on this platform (the runtime turns them off).
//   `report_flags.report_id` is a logical reference to `price_reports.id` and must
//   be enforced in application code: delete a report's flags before the report.
// - The product catalog lives in code (`lib/catalog.js`), not in the database, so
//   `price_reports.product_key` is a logical reference to a catalog key there.

import { table, integer, text, index, uniqueIndex, check, sql } from 'sdk/db';

// One person's report of what one product cost, plus its moderation state.
// Readers only ever see `approved` rows; the author can also see their own
// pending/rejected rows. `reviewed_by`/`reviewed_at`/`review_note` record the
// administrator decision so users can be told why a report was rejected.
export const priceReports = table(
  'price_reports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productKey: text('product_key').notNull(),
    userId: integer('user_id').notNull(),
    priceToman: integer('price_toman').notNull(),
    storeName: text('store_name'),
    city: text('city'),
    status: text('status').notNull().default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    reviewedBy: integer('reviewed_by'),
    reviewNote: text('review_note'),
  },
  (t) => ({
    // "Recent approved reports for one product" — the hot read path.
    byProduct: index('idx_price_reports_product').on(t.productKey, t.status, t.createdAt),
    // "My reports", newest first.
    byUser: index('idx_price_reports_user').on(t.userId, t.createdAt),
    // The moderation queue.
    byStatus: index('idx_price_reports_status').on(t.status, t.createdAt),
    priceIsPositive: check('chk_price_reports_price', sql`${t.priceToman} > 0`),
    statusIsKnown: check(
      'chk_price_reports_status',
      sql`${t.status} in ('pending', 'approved', 'rejected')`,
    ),
  }),
);

// A "this looks wrong" vote on a report. One user may flag a report once; the
// unique index is what enforces that, so duplicate flags fail at the database
// rather than being counted twice.
export const reportFlags = table(
  'report_flags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reportId: integer('report_id').notNull(),
    userId: integer('user_id').notNull(),
    reason: text('reason'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    oneFlagPerUser: uniqueIndex('uidx_report_flags_report_user').on(t.reportId, t.userId),
    byReport: index('idx_report_flags_report').on(t.reportId),
  }),
);
