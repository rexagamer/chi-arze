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

    const [message, callbackQuery, reports, moderation, users, catalog, summary, reportInput, text, views] =
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
    };
  }

  // Every test starts from an empty database and a clean call log.
  for (const name of ['report_flags', 'price_reports', 'products', 'users']) {
    booted.database.exec(`DELETE FROM "${name}"`);
  }
  booted.database.exec("DELETE FROM sqlite_sequence WHERE name IN ('users','products','price_reports','report_flags')");
  calls.length = 0;
  return booted;
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

/** The last message text the bot sent. */
export function lastText() {
  return calls.at(-1)?.[1]?.text ?? '';
}

export function lastMethod() {
  return calls.at(-1)?.[0];
}
