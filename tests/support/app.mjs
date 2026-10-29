// Boots the bot against a fresh in-memory SQLite database.
//
// The schema DDL is generated from `tgcloud/schema.js` itself, so a test can
// never pass against a table that the real schema does not describe — if a
// UNIQUE index or CHECK constraint is missing there, it is missing here too.

import { register } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

import { calls, schemaDdl, state } from './sdk.mjs';

register('./hooks.mjs', import.meta.url);

let booted;

export async function createTestApp() {
  if (!booted) {
    const schema = await import('../../tgcloud/schema.js');
    const statements = schemaDdl(schema);

    const database = new DatabaseSync(':memory:');
    state.database = database;
    for (const statement of statements) database.exec(statement);

    const [message, callbackQuery, reports, moderation, users, catalog, summary, reportInput, text, views, keyboards] =
      await Promise.all([
        import('../../tgcloud/handlers/message.js'),
        import('../../tgcloud/handlers/callback_query.js'),
        import('../../tgcloud/lib/reports.js'),
        import('../../tgcloud/lib/moderation.js'),
        import('../../tgcloud/lib/users.js'),
        import('../../tgcloud/lib/catalog.js'),
        import('../../tgcloud/lib/summary.js'),
        import('../../tgcloud/lib/report-input.js'),
        import('../../tgcloud/lib/text.js'),
        import('../../tgcloud/lib/views.js'),
        import('../../tgcloud/lib/keyboards.js'),
      ]);

    booted = {
      database,
      schema,
      statements,
      message: message.default,
      callbackQuery: callbackQuery.default,
      reports,
      moderation,
      users,
      catalog,
      summary,
      reportInput,
      text,
      views,
      keyboards,
      calls,
    };
  }

  // Every test starts from an empty database and a clean call log.
  for (const name of ['report_flags', 'price_reports', 'products', 'users']) {
    booted.database.exec(`DELETE FROM "${name}"`);
  }
  booted.database.exec("DELETE FROM sqlite_sequence WHERE name IN ('users','products','price_reports','report_flags')");
  calls.length = 0;
  state.failures.clear();
  return booted;
}

/**
 * Re-create every table from the schema. Used by the tests that deliberately
 * break the database (a dropped table) to prove the bot answers instead of
 * crashing — the next test must start from a working schema again.
 */
export function restoreSchema() {
  for (const name of ['report_flags', 'price_reports', 'products', 'users']) {
    booted.database.exec(`DROP TABLE IF EXISTS "${name}"`);
  }
  for (const statement of booted.statements) booted.database.exec(statement);
}

/** The chat payload a handler receives. */
export function message(chatId, fromId, text, extra = {}) {
  return {
    message_id: 1,
    chat: { id: chatId, type: 'private' },
    from: { id: fromId, first_name: 'کاربر', ...extra.from },
    text,
    ...extra.message,
  };
}

const SCREEN_METHODS = new Set(['sendMessage', 'editMessageText']);

/** The last [method, params] pair that rendered a screen (not a callback answer). */
export function lastScreen() {
  return [...calls].reverse().find(([method]) => SCREEN_METHODS.has(method)) ?? null;
}

/** The text of the last screen the bot rendered. */
export function lastText() {
  return lastScreen()?.[1]?.text ?? '';
}

/** "sendMessage" or "editMessageText" — how the last screen reached the user. */
export function lastMethod() {
  return lastScreen()?.[0] ?? null;
}

/** Screens actually delivered — a call that threw rendered nothing. */
export function screenCount() {
  return calls.filter(([method, , status]) => SCREEN_METHODS.has(method) && status !== 'failed').length;
}
