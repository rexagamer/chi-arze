// Catalog persistence: the only module that talks to the `products` table.
//
// The catalog is data, not code: it is seeded once by an administrator and then
// queried by the bot. Seeding is idempotent because `products.normalized_name`
// is UNIQUE — a second run conflicts and inserts nothing.

import { db } from 'sdk';
import { and, asc, eq, like, or } from 'sdk/db';
import { products } from '../schema.js';
import { SEED_PRODUCTS, toProductRow } from './catalog-data.js';
import { CATALOG_PAGE_SIZE, SEARCH } from './config.js';
import { toPositiveInt } from './input.js';
import { likePatterns, queryTokens, rankMatches } from './search.js';

// A batch insert is a single SQLite statement, so it is bounded by the variable
// limit (rows × columns). Chunking keeps a growing catalog safe to seed.
const SEED_CHUNK_SIZE = 25;

/**
 * Insert any catalog entry that is not in the database yet.
 *
 * Idempotent by construction: `onConflictDoNothing` on the UNIQUE normalized
 * name means existing products are left untouched (no overwrite of a curated
 * name, no duplicate), and only genuinely new entries are added.
 *
 * Intended to run as the admin `/seed` command after `npm run migrate` — never
 * on a message, and never on module load.
 */
export async function seedCatalog(entries = SEED_PRODUCTS) {
  const rows = entries.map(toProductRow);
  const before = await db.$count(products);

  for (let start = 0; start < rows.length; start += SEED_CHUNK_SIZE) {
    await db
      .insert(products)
      .values(rows.slice(start, start + SEED_CHUNK_SIZE))
      .onConflictDoNothing({ target: products.normalizedName })
      .run();
  }

  const total = await db.$count(products);
  return { inserted: total - before, total };
}

/** How many products are currently visible to users. */
export function countActiveProducts() {
  return db.$count(products, eq(products.isActive, true));
}

/**
 * One page of the catalog, oldest first. Paginated in SQL rather than loaded and
 * sliced in memory, so the read cost does not grow with the catalog.
 */
export function listActiveProducts({ page = 0, limit = CATALOG_PAGE_SIZE } = {}) {
  const offset = Math.max(page, 0) * limit;
  return db
    .select()
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(asc(products.id))
    .limit(limit)
    .offset(offset)
    .all();
}

/**
 * Look a product up by its database id, or null.
 *
 * This is the validation step for product references: price reports and flags
 * store ids without a foreign key, so callers must check the result themselves
 * (`if (!product) …`). A non-integer or non-positive id never reaches the query.
 */
export async function getProductById(productId) {
  const id = toPositiveInt(productId);
  if (id == null) return null;
  return db.select().from(products).where(eq(products.id, id)).get();
}

/**
 * Search active products by name and keywords.
 *
 * Filtering happens in SQL (so the cost stays bounded as the catalog grows) and
 * ordering happens in `search.js`. Every query word must match either the
 * normalized name or the keywords, which is why "شارژر اپل" and "apple charger"
 * both work. A blank query returns [] instead of every product.
 */
export async function searchProducts(query, { limit = SEARCH.results } = {}) {
  const tokens = queryTokens(query);
  if (!tokens.length) return [];

  // AND across words, OR across columns: every word must appear in the name or
  // in the keywords. `LIKE` on a NULL `keywords` yields NULL, and `NULL OR true`
  // is true, so products without keywords still match on their name.
  const tokenConditions = likePatterns(tokens).map((pattern) =>
    or(like(products.normalizedName, pattern), like(products.keywords, pattern)),
  );

  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.isActive, true), ...tokenConditions))
    .orderBy(asc(products.id))
    .limit(SEARCH.scanLimit)
    .all();

  return rankMatches(rows, query).slice(0, limit);
}
