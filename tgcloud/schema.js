// tgcloud/schema.js — the bot's database. Tables are named exports; the platform
// discovers them here, and `npx tgcloud migrate` applies the diff to the live
// database. Deploying code never changes the database; nothing in this file runs
// at request time, so no table is ever created, seeded or recreated by a message.
//
// Platform facts that shaped this schema (see docs/tgcloud-sdk.md):
// - There are no foreign keys: the runtime runs SQLite with `PRAGMA
//   foreign_keys` off and the DSL rejects `.references()`. Every relationship
//   below is a *logical* reference, validated in application code.
// - Money is stored as a whole number of toman — never rial, never a float, so
//   comparisons and formatting stay exact.
// - `created_at` is unix seconds (`mode: 'timestamp'`), defaulted by SQLite.

import { table, integer, text, boolean, index, uniqueIndex, check, sql } from 'sdk/db';

// One row per Telegram account that has used the bot. Identity is the numeric
// Telegram user id (`tg_id`), never the username: usernames change and can be
// released. No phone number, email or other personal data is stored.
export const users = table(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tgId: integer('tg_id').notNull().unique(),
    firstName: text('first_name'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
);

// The curated accessory catalog. Seeded from `lib/catalog-data.js` by the admin
// `/seed` command; never inserted from a message handler.
//
// `normalized_name` is the product's name run through `normalizeText` (Persian /
// Arabic spelling folded, digits latinised). It is UNIQUE, which is what makes
// seeding idempotent: a second run conflicts on this column and inserts nothing,
// so the catalog cannot silently double. It is also the search column.
//
// `keywords` holds normalized extra terms (brand, English name, spec aliases)
// that make "power bank" and "پاوربانک" find the same row.
export const products = table(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull().unique(),
    category: text('category').notNull(),
    keywords: text('keywords'),
    // Retiring a product hides it from browsing and search without deleting the
    // price reports that reference it.
    isActive: boolean('is_active').notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    // No extra indexes: lookups by name use the UNIQUE index above, the list is
    // a small ordered scan of active rows, and `LIKE '%term%'` search cannot use
    // a B-tree anyway. Add one only when a query actually needs it.
    // Deliberate coupling: adding a category in `lib/catalog-data.js` also needs
    // a migration here. That is the point — an unknown category would otherwise
    // be stored and silently render as "uncategorised".
    categoryIsKnown: check(
      'chk_products_category',
      sql`${t.category} in ('charger', 'wireless', 'cable', 'powerbank', 'audio', 'speaker', 'case', 'glass', 'adapter', 'holder')`,
    ),
  }),
);

// A user's report of what one product cost, plus its moderation state.
//
// `pending` is the default and the only state a new report can be created in:
// nothing is published as a market price until an administrator approves it.
// `product_id` and `user_id` are logical references to `products.id` and
// `users.id`; there is no foreign key, so callers resolve and validate them.
export const priceReports = table(
  'price_reports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id').notNull(),
    userId: integer('user_id').notNull(),
    priceToman: integer('price_toman').notNull(),
    // `store_name` is shown exactly as the reporter typed it; `store_key` is the
    // same text folded by `normalizeText`, used only to detect duplicate reports
    // ("دیجی‌کالا" and "دیجی کالا" are the same store).
    storeName: text('store_name').notNull(),
    storeKey: text('store_key').notNull(),
    sourceUrl: text('source_url'),
    status: text('status').notNull().default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    // Moderation metadata: who decided, when, and why. `reviewed_by` is the
    // administrator's *Telegram* user id (the same value as in ADMIN_IDS), not an
    // internal users.id: administrators are configured, not registered, so they
    // may have no users row at all.
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    reviewedBy: integer('reviewed_by'),
    reviewNote: text('review_note'),
  },
  (t) => ({
    // Product page: recent approved reports for one product. Also serves
    // product-only lookups, as `product_id` is its leftmost column.
    byProduct: index('idx_price_reports_product').on(t.productId, t.status, t.createdAt),
    // "My reports", newest first.
    byUser: index('idx_price_reports_user').on(t.userId, t.createdAt),
    // Moderation queue: oldest pending first.
    byStatus: index('idx_price_reports_status').on(t.status, t.createdAt),
    priceIsPositive: check('chk_price_reports_price', sql`${t.priceToman} > 0`),
    statusIsKnown: check(
      'chk_price_reports_status',
      sql`${t.status} in ('pending', 'approved', 'rejected')`,
    ),
  }),
);

// A "this looks wrong" vote on a report. Deliberately minimal: no reputation, no
// dispute threads — a count of distinct flags is all the moderation view needs.
// `report_id` and `user_id` are logical references (no foreign keys).
export const reportFlags = table(
  'report_flags',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reportId: integer('report_id').notNull(),
    userId: integer('user_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    // One flag per user per report, enforced by the database rather than by a
    // read-then-write in application code (which would race).
    oneFlagPerUser: uniqueIndex('uidx_report_flags_report_user').on(t.reportId, t.userId),
  }),
);
