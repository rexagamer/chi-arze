// Users: the bridge between a Telegram account and the internal `users.id` that
// price reports and flags reference.
//
// Identity is the numeric Telegram id, never the username. Only the first name
// is stored (so a moderator can recognise a reporter), and it is refreshed each
// time the person talks to the bot.

import { db } from 'sdk';
import { sql } from 'sdk/db';
import { TEXT_LIMITS } from './config.js';
import { cleanFreeText } from './input.js';

/**
 * Insert the user on first contact, refresh the first name afterwards, and
 * return the internal row.
 *
 * One statement, so two updates arriving together cannot create the account
 * twice; `users.tg_id` is UNIQUE as a second line of defence. `coalesce` keeps
 * the stored name when Telegram sends none this time, instead of blanking it.
 */
export async function ensureUser(from) {
  const tgId = from?.id;
  if (!Number.isInteger(tgId)) return null;

  const firstName = cleanFreeText(from.first_name, TEXT_LIMITS.firstName);
  const result = await db.run(sql`
    INSERT INTO users (tg_id, first_name) VALUES (${tgId}, ${firstName})
    ON CONFLICT (tg_id) DO UPDATE SET first_name = coalesce(excluded.first_name, users.first_name)
    RETURNING id, tg_id, first_name, created_at
  `);

  const row = result.rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    tgId: row.tg_id,
    firstName: row.first_name ?? null,
    createdAt: new Date(row.created_at * 1000),
  };
}

/** The internal user for a Telegram id, or null if they never contacted us. */
export async function getUserByTgId(tgId) {
  if (!Number.isInteger(tgId)) return null;
  const row = await db.get(sql`SELECT id, tg_id FROM users WHERE tg_id = ${tgId}`);
  return row ? { id: row.id, tgId: row.tg_id } : null;
}
