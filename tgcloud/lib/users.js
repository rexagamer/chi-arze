// Users: the bridge between a Telegram account and the internal `users.id` that
// price reports and flags reference.
//
// Identity is the numeric Telegram id, never the username. Only the first name
// is stored (for moderators to recognise a reporter), and it is refreshed each
// time the person starts the bot.

import { db } from 'sdk';
import { sql } from 'sdk/db';
import { users } from '../schema.js';
import { TEXT_LIMITS } from './config.js';
import { cleanFreeText } from './input.js';

/**
 * Insert the user if this is their first visit, and refresh the first name
 * otherwise. Returns the internal row (with its `id`), or null when the update
 * carries no usable Telegram user.
 *
 * A single upsert rather than select-then-insert, so two concurrent updates
 * cannot create the same user twice — `users.tg_id` is UNIQUE as well.
 */
export async function ensureUser(from) {
  const tgId = from?.id;
  if (!Number.isInteger(tgId)) return null;

  const firstName = cleanFreeText(from.first_name, TEXT_LIMITS.firstName);
  const [row] = await db
    .insert(users)
    .values({ tgId, firstName })
    .onConflictDoUpdate({
      target: users.tgId,
      // Keep the stored name when Telegram sends none this time (coalesce),
      // instead of blanking it.
      set: { firstName: sql`coalesce(excluded.first_name, ${users.firstName})` },
    })
    .returning();

  return row ?? null;
}
