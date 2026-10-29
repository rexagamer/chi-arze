// Screens: compose data + Persian copy + keyboard into one message ready to send.
//
// Handlers stay routing-only, and a screen is built the same way whoever asks
// for it — `/products 2`, a "next page" button, `/product 5`.

import { getProductById, countActiveProducts, listActiveProducts, searchProducts } from './catalog.js';
import { CATALOG_PAGE_SIZE, SUMMARY } from './config.js';
import { toPositiveInt } from './input.js';
import { catalogPagination, mainMenu } from './keyboards.js';
import { countPendingReports, inspectReport, listPendingReports, moderationStats } from './moderation.js';
import { approvedPriceSamples, productPriceSummary } from './reports.js';
import { priceDeviation } from './summary.js';
import {
  EMPTY_CATALOG,
  adminOverviewMessage,
  inspectMessage,
  pendingQueueMessage,
  productListMessage,
  productPriceMessage,
  searchResultsMessage,
} from './text.js';

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

/**
 * The price page for one product: approved reports only, with how old the
 * newest one is and how many people it came from. Returns null if the product
 * does not exist, so the caller can say so.
 */
export async function productView(productId) {
  const id = toPositiveInt(productId);
  if (id == null) return null;

  const product = await getProductById(id);
  if (!product) return null;

  const summary = await productPriceSummary(product.id);
  return { text: productPriceMessage({ product, summary }), keyboard: null };
}

/**
 * The moderation queue. Outlier hints are computed for the whole page in one
 * extra query, never stored: they depend on today's approved prices.
 */
export async function pendingView() {
  const reports = await listPendingReports({ limit: SUMMARY.pendingPageSize });
  const total = await countPendingReports();

  const samples = await approvedPriceSamples(reports.map((report) => report.productId));
  const deviations = new Map();
  for (const report of reports) {
    const deviation = priceDeviation(report.priceToman, samples.get(report.productId) ?? []);
    if (deviation?.isUnusual) deviations.set(report.id, deviation);
  }

  return { text: pendingQueueMessage({ reports, total, deviations }), keyboard: null };
}

/** `/admin`: the counts and the command list. No configuration is revealed. */
export async function adminView() {
  const stats = await moderationStats();
  return { text: adminOverviewMessage(stats), keyboard: null };
}

/** One report in full, for a decision. Null when it does not exist. */
export async function inspectView(reportId) {
  const details = await inspectReport(reportId);
  if (!details) return null;

  const samples = await approvedPriceSamples([details.report.productId]);
  const deviation = priceDeviation(
    details.report.priceToman,
    samples.get(details.report.productId) ?? [],
  );

  return {
    text: inspectMessage({ ...details, deviation }),
    keyboard: null,
  };
}
