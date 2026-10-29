// Inline keyboards and the callback-data contract.
//
// `callback_data` is capped at 64 bytes and is the only state a button carries,
// so every button encodes a short "<area>:<action>[:<arg>]" string that the
// callback_query handler parses back.

import { toPositiveInt } from './input.js';

export const CALLBACK_MENU_HELP = 'menu:help';
export const CALLBACK_MENU_ABOUT = 'menu:about';

const CALLBACK_CATALOG_PAGE = 'catalog:page';

export function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '📦 کالاها', callback_data: `${CALLBACK_CATALOG_PAGE}:0` }],
      [{ text: '📖 راهنما', callback_data: CALLBACK_MENU_HELP }],
      [{ text: 'ℹ️ دربارهٔ ربات', callback_data: CALLBACK_MENU_ABOUT }],
    ],
  };
}

/** Previous/next buttons for a catalog page; null when there is nowhere to go. */
export function catalogPagination(page, pageCount) {
  const row = [];
  if (page > 0) row.push({ text: '« قبلی', callback_data: `${CALLBACK_CATALOG_PAGE}:${page - 1}` });
  if (page + 1 < pageCount) {
    row.push({ text: 'بعدی »', callback_data: `${CALLBACK_CATALOG_PAGE}:${page + 1}` });
  }
  return row.length ? { inline_keyboard: [row] } : null;
}

/**
 * The page number in a `catalog:page:<n>` callback, or null for anything else —
 * including the menu button's own `catalog:page:0`, which is handled the same way.
 */
export function parseCatalogPageCallback(data) {
  if (typeof data !== 'string' || !data.startsWith(`${CALLBACK_CATALOG_PAGE}:`)) return null;
  return toPositiveInt(data.slice(CALLBACK_CATALOG_PAGE.length + 1)) ?? 0;
}
