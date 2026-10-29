// Screens: compose data + Persian copy + keyboard into one message ready to send.
//
// Handlers stay routing-only, and the catalog page is built the same way whether
// it was asked for by `/products 2` or by a "next page" button — the alternative
// would be the same paging arithmetic written twice.

import { countActiveProducts, listActiveProducts, searchProducts } from './catalog.js';
import { CATALOG_PAGE_SIZE } from './config.js';
import { toPositiveInt } from './input.js';
import { catalogPagination, mainMenu } from './keyboards.js';
import { EMPTY_CATALOG, productListMessage, searchResultsMessage } from './text.js';

/** A catalog page, clamped to the pages that exist. `requestedPage` is 0-based. */
export async function catalogPageView(requestedPage = 0) {
  const total = await countActiveProducts();
  if (total === 0) return { text: EMPTY_CATALOG, keyboard: null };

  const pageCount = Math.ceil(total / CATALOG_PAGE_SIZE);
  const page = Math.min(Math.max(toPositiveInt(requestedPage) ?? 0, 0), pageCount - 1);
  const products = await listActiveProducts({ page });

  return {
    text: productListMessage({ products, page, pageCount, total }),
    // With a single page there is nowhere to page to, so offer the menu instead.
    keyboard: catalogPagination(page, pageCount) ?? mainMenu(),
  };
}

/** Search results for a (non-empty) query. */
export async function searchView(query) {
  const products = await searchProducts(query);
  return { text: searchResultsMessage({ query, products }), keyboard: null };
}
