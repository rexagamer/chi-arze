// Inline keyboards and the callback-data contract.
//
// `callback_data` is capped at 64 bytes and is the only state a button carries,
// so every button encodes a short "<area>:<action>[:<arg>]" string, and
// `parseCallbackData` is the single place that turns one back into a descriptor.
// Nothing is trusted because it came from a button: the parser only proves the
// *shape*, and the handler still checks that the row exists and that the user may
// do this (see `handlers/callback_query.js`).

import { toPositiveInt } from './input.js';

/** Telegram's hard limit on `callback_data`. */
const MAX_CALLBACK_BYTES = 64;

const CALLBACK_MENU_HELP = 'menu:help';
const CALLBACK_MENU_ABOUT = 'menu:about';

const CATALOG = 'catalog';
const PRODUCT = 'product';
const FLAG = 'flag';
const MOD = 'mod';

export function mainMenu() {
  return {
    inline_keyboard: [
      [{ text: '📦 کالاها', callback_data: `${CATALOG}:page:0` }],
      [{ text: '📖 راهنما', callback_data: CALLBACK_MENU_HELP }],
      [{ text: 'ℹ️ دربارهٔ ربات', callback_data: CALLBACK_MENU_ABOUT }],
    ],
  };
}

/** One text button per product — the primary way to pick a product. */
function productRows(products) {
  return products.map((product) => [
    { text: product.name, callback_data: `${PRODUCT}:${product.id}` },
  ]);
}

function previousNextRow(page, pageCount) {
  const row = [];
  if (page > 0) row.push({ text: '« قبلی', callback_data: `${CATALOG}:page:${page - 1}` });
  if (page + 1 < pageCount) {
    row.push({ text: 'بعدی »', callback_data: `${CATALOG}:page:${page + 1}` });
  }
  return row;
}

const backToCatalog = () => [{ text: '« فهرست کالاها', callback_data: `${CATALOG}:page:0` }];

/** Product buttons, plus paging when the catalog has more than one page. */
export function productListKeyboard({ products, page, pageCount }) {
  const rows = productRows(products);
  const nav = previousNextRow(page, pageCount);
  if (nav.length) rows.push(nav);
  return { inline_keyboard: rows.length ? rows : mainMenu().inline_keyboard };
}

/** Search results: the same product buttons, with a way back to the full list. */
export function searchResultsKeyboard(products) {
  if (!products.length) return mainMenu();
  return { inline_keyboard: [...productRows(products), backToCatalog()] };
}

/**
 * The price page: a flag button for each published report, and a way back.
 * Flagging is the one action here that needs no typed argument, so it earns a
 * button; submitting a price needs prices and store names, so it stays a command.
 */
export function productKeyboard({ reports = [] }) {
  const rows = reports.map((report) => [
    { text: `🚩 علامت‌زدن گزارش #${report.id}`, callback_data: `${FLAG}:${report.id}` },
  ]);
  rows.push(backToCatalog());
  return { inline_keyboard: rows };
}

/** Approve/reject a pending report — only administrators ever receive these. */
export function moderationKeyboard(reportIds = []) {
  const rows = reportIds.map((id) => [
    { text: `✅ تأیید #${id}`, callback_data: `${MOD}:approve:${id}` },
    { text: `🗑 رد #${id}`, callback_data: `${MOD}:reject:${id}` },
  ]);
  rows.push([{ text: '« صف بررسی', callback_data: `${MOD}:queue:0` }]);
  return { inline_keyboard: rows };
}

/**
 * A callback payload → what it asks for, or null.
 *
 * Rejects anything that is not the exact shape this bot writes: unknown areas,
 * unknown actions, wrong arity, non-integer ids, oversized payloads. Bounds are
 * checked here so no later code has to defend against a crafted id.
 */
export function parseCallbackData(data) {
  if (typeof data !== 'string') return null;
  if (data.length === 0 || data.length > MAX_CALLBACK_BYTES) return null;

  const parts = data.split(':');
  const [area, action, argument] = parts;

  switch (area) {
    case 'menu':
      if (parts.length !== 2) return null;
      return action === 'help' || action === 'about' ? { kind: 'menu', view: action } : null;

    case CATALOG: {
      if (parts.length !== 3 || action !== 'page') return null;
      const page = toNonNegativeInt(argument);
      return page == null ? null : { kind: 'catalogPage', page };
    }

    case PRODUCT: {
      if (parts.length !== 2) return null;
      const id = toPositiveInt(action);
      return id == null ? null : { kind: 'product', id };
    }

    case FLAG: {
      if (parts.length !== 2) return null;
      const id = toPositiveInt(action);
      return id == null ? null : { kind: 'flag', id };
    }

    case MOD: {
      if (parts.length !== 3) return null;
      if (action === 'queue') return { kind: 'queue' };
      if (action !== 'approve' && action !== 'reject') return null;
      const id = toPositiveInt(argument);
      return id == null ? null : { kind: 'moderate', action, id };
    }

    default:
      return null;
  }
}

/**
 * A small page number, zero allowed ("first page"). Capped so a crafted payload
 * cannot ask for an absurd offset; the view clamps again.
 */
function toNonNegativeInt(value) {
  if (typeof value !== 'string') return null;
  if (value === '0') return 0;
  const parsed = toPositiveInt(value);
  return parsed != null && parsed <= 1000 ? parsed : null;
}
