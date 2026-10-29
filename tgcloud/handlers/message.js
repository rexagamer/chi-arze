// handlers/message.js — every incoming message.
//
// The platform calls this with the `Message` payload; this file is the bot's
// router. Commands are looked up by name (so `/search@ChiArzehBot` works), plain
// text is a catalog search, and every administrative command passes through one
// authorisation gate before it can touch data.

import { seedCatalog } from '../lib/catalog.js';
import { SEARCH, isAdmin } from '../lib/config.js';
import { approveReport, flagReport, rejectReport } from '../lib/moderation.js';
import { toPositiveInt } from '../lib/input.js';
import { mainMenu } from '../lib/keyboards.js';
import { parseReportInput } from '../lib/report-input.js';
import { recentApprovedPrices, submitReport } from '../lib/reports.js';
import { priceDeviation } from '../lib/summary.js';
import {
  ABOUT,
  ADMIN_ONLY,
  HELP,
  NON_TEXT,
  FLAG_ID_REQUIRED,
  PRODUCT_ID_REQUIRED,
  REPORT_FAILED,
  REPORT_ID_REQUIRED,
  SEARCH_EMPTY_QUERY,
  SEED_FAILED,
  START,
  decisionMessage,
  flagResultMessage,
  reportErrorText,
  reportSubmittedMessage,
  seedResultMessage,
  searchQueryTooLong,
  unknownCommand,
  yourIdMessage,
} from '../lib/text.js';
import { sendHtml } from '../lib/telegram.js';
import { ensureUser } from '../lib/users.js';
import {
  adminView,
  catalogPageView,
  inspectView,
  pendingView,
  productView,
  searchView,
} from '../lib/views.js';

/** Administrator-only commands. Checked once, in the router, before dispatch. */
const ADMIN_COMMANDS = new Set(['admin', 'pending', 'inspect', 'approve', 'reject', 'seed']);

const COMMANDS = new Map([
  ['start', start],
  ['help', (message) => sendHtml(message.chat.id, HELP, mainMenu())],
  ['about', (message) => sendHtml(message.chat.id, ABOUT, mainMenu())],
  [
    'id',
    (message) =>
      sendHtml(message.chat.id, yourIdMessage(message.from?.id, isAdmin(message.from?.id))),
  ],
  ['products', products],
  ['search', (message, args) => search(message, args)],
  ['product', product],
  ['price', product], // alias: the price page for one product
  ['report', report],
  ['flag', flag],
  ['seed', seed],
  ['admin', admin],
  ['pending', pending],
  ['inspect', inspect],
  ['approve', (message, args) => decide(message, args, 'approve')],
  ['reject', (message, args) => decide(message, args, 'reject')],
]);

/** "/search@ChiArzehBot charger" → { name: 'search', args: 'charger' }. */
function parseCommand(text) {
  if (typeof text !== 'string' || text[0] !== '/') return null;
  const [head, ...rest] = text.trim().split(/\s+/);
  const name = head.slice(1).split('@')[0].toLowerCase();
  return name ? { name, args: rest.join(' ') } : null;
}

export default async function (message) {
  const chatId = message.chat.id;
  const command = parseCommand(message.text);

  if (command) {
    const handler = COMMANDS.get(command.name);
    if (!handler) return sendHtml(chatId, unknownCommand(command.name), mainMenu());

    // One gate for every privileged command: nothing below it runs for
    // unauthorised users, so no data can be read or changed by them.
    if (ADMIN_COMMANDS.has(command.name) && !isAdmin(message.from?.id)) {
      return sendHtml(chatId, ADMIN_ONLY);
    }
    return handler(message, command.args);
  }

  if (typeof message.text !== 'string') return sendHtml(chatId, NON_TEXT, mainMenu());

  return search(message, message.text);
}

async function start(message) {
  // Registration is a side effect of saying hello, not a precondition for it:
  // if the schema has not been migrated yet, /start must still answer.
  try {
    await ensureUser(message.from);
  } catch (error) {
    console.error('could not register the user', error?.message ?? error);
  }
  return sendHtml(message.chat.id, START, mainMenu());
}

/** `/products`, optionally with a 1-based page number. */
async function products(message, args) {
  const requested = toPositiveInt(args);
  const view = await catalogPageView(requested ? requested - 1 : 0);
  return sendHtml(message.chat.id, view.text, view.keyboard);
}

/** `/search <query>`, and any plain text. */
async function search(message, rawQuery) {
  const query = String(rawQuery ?? '').trim();
  if (!query) return sendHtml(message.chat.id, SEARCH_EMPTY_QUERY);
  if (query.length > SEARCH.maxQueryLength) {
    return sendHtml(message.chat.id, searchQueryTooLong(SEARCH.maxQueryLength));
  }

  const view = await searchView(query);
  return sendHtml(message.chat.id, view.text, view.keyboard);
}

/** `/product <id>` — the published price page for one product. */
async function product(message, args) {
  const id = toPositiveInt(args);
  if (id == null) return sendHtml(message.chat.id, PRODUCT_ID_REQUIRED);

  const view = await productView(id);
  if (!view) return sendHtml(message.chat.id, reportErrorText({ error: 'PRODUCT_NOT_FOUND' }));
  return sendHtml(message.chat.id, view.text, view.keyboard);
}

/**
 * `/report <product> | <price> | <store> | [url]`.
 *
 * Shape is validated by `parseReportInput` (pure), storage rules by
 * `submitReport` (database, rate limit, duplicates). The confirmation always
 * says the report is pending — it is not a price yet.
 */
async function report(message, args) {
  const parsed = parseReportInput(args);
  if (!parsed.ok) return sendHtml(message.chat.id, reportErrorText(parsed));

  try {
    const result = await submitReport(message.from, parsed.value);
    if (!result.ok) return sendHtml(message.chat.id, reportErrorText(result));

    // A heads-up only; it never blocks the report and never changes its status.
    const sample = await recentApprovedPrices(result.product.id);
    const deviation = priceDeviation(result.report.priceToman, sample);

    return sendHtml(
      message.chat.id,
      reportSubmittedMessage({ report: result.report, product: result.product, deviation }),
    );
  } catch (error) {
    console.error('report submission failed', error?.message ?? error);
    return sendHtml(message.chat.id, REPORT_FAILED);
  }
}

/** `/flag <report_id>` — a suspicion goes to the moderators, not to the bin. */
async function flag(message, args) {
  const id = toPositiveInt(args);
  if (id == null) return sendHtml(message.chat.id, FLAG_ID_REQUIRED);

  const user = await ensureUser(message.from);
  if (!user) return sendHtml(message.chat.id, reportErrorText({ error: 'USER_UNKNOWN' }));

  const result = await flagReport(id, user.id);
  return sendHtml(message.chat.id, flagResultMessage(result, id));
}

/**
 * Administrator-only: load the seed catalog into the `products` table.
 * Authorisation happened in the router — `seed` is in ADMIN_COMMANDS.
 */
async function seed(message) {
  try {
    const result = await seedCatalog();
    console.log('catalog seeded', result);
    return sendHtml(message.chat.id, seedResultMessage(result), mainMenu());
  } catch (error) {
    console.error('catalog seeding failed', error?.description ?? error);
    return sendHtml(message.chat.id, SEED_FAILED);
  }
}

async function admin(message) {
  const view = await adminView();
  return sendHtml(message.chat.id, view.text, view.keyboard);
}

async function pending(message) {
  const view = await pendingView();
  return sendHtml(message.chat.id, view.text, view.keyboard);
}

async function inspect(message, args) {
  const id = toPositiveInt(args);
  const view = id == null ? null : await inspectView(id);
  if (!view) return sendHtml(message.chat.id, reportErrorText({ error: 'REPORT_NOT_FOUND' }));
  return sendHtml(message.chat.id, view.text, view.keyboard);
}

/**
 * `/approve <id>` and `/reject <id> [reason]`. The authorisation check happened
 * in the router; `moderation.decide` re-checks the report's state, so an
 * already-decided report can never be decided again.
 */
async function decide(message, args, action) {
  const [idPart, ...reasonParts] = String(args ?? '').trim().split(/\s+/);
  const id = toPositiveInt(idPart);
  if (id == null) return sendHtml(message.chat.id, REPORT_ID_REQUIRED(action));

  const reviewerTgId = message.from?.id;
  const result =
    action === 'approve'
      ? await approveReport(id, reviewerTgId)
      : await rejectReport(id, reviewerTgId, reasonParts.join(' '));

  return sendHtml(message.chat.id, decisionMessage(result, { action, reportId: id }));
}
