// handlers/message.js — every incoming message.
//
// The platform calls this with the `Message` payload and routes nothing itself:
// this file is the bot's router. Commands are looked up by name (so
// `/search@ChiArzehBot` works), and plain text is treated as a catalog search,
// which is the fastest path to a product for someone who just types "شارژر اپل".

import { isAdmin, SEARCH } from '../lib/config.js';
import { seedCatalog } from '../lib/catalog.js';
import { toPositiveInt } from '../lib/input.js';
import { mainMenu } from '../lib/keyboards.js';
import {
  ABOUT,
  HELP,
  NON_TEXT,
  SEARCH_EMPTY_QUERY,
  SEED_FAILED,
  SEED_NOT_ALLOWED,
  START,
  seedResultMessage,
  searchQueryTooLong,
  unknownCommand,
  yourIdMessage,
} from '../lib/text.js';
import { sendHtml } from '../lib/telegram.js';
import { ensureUser } from '../lib/users.js';
import { catalogPageView, searchView } from '../lib/views.js';

// `/start` and `/help` are the entry points; `/productѕ` and `/search` are the
// catalog; `/seed` is an administrator command and is intentionally not listed
// in the public help.
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
  ['seed', seed],
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
    if (handler) return handler(message, command.args);
    return sendHtml(chatId, unknownCommand(command.name), mainMenu());
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

/**
 * Administrator-only: load the seed catalog into the `products` table.
 *
 * This is the seeding mechanism, and it is deliberately explicit: the platform
 * has no data-migration hook (`tgcloud migrate` applies schema diffs only), and
 * seeding from a message handler is idempotent, so it can safely be re-run after
 * every deploy that adds products.
 */
async function seed(message) {
  if (!isAdmin(message.from?.id)) return sendHtml(message.chat.id, SEED_NOT_ALLOWED);

  try {
    const result = await seedCatalog();
    console.log('catalog seeded', result);
    return sendHtml(message.chat.id, seedResultMessage(result), mainMenu());
  } catch (error) {
    // The likeliest cause is an unmigrated database; log the real error for us.
    console.error('catalog seeding failed', error?.description ?? error);
    return sendHtml(message.chat.id, SEED_FAILED);
  }
}
