// A test double for the platform SDK, backed by real SQLite (`node:sqlite`).
//
// Why it exists: most of this bot's rules — the per-user rate limit, duplicate
// detection, status transitions, summaries — are SQL, and a test that mocks them
// proves nothing. This module implements the slice of `sdk` the project uses and
// runs it against a real database, so CHECK constraints, UNIQUE indexes and
// `ON CONFLICT` behave exactly as they will on the platform.
//
// It is *not* the SDK: the query builder is re-implemented (filtering happens in
// JS), and only the raw-SQL path is executed as written. Anything that depends
// on SDK-specific behaviour still has to be verified with `npx tgcloud run`.

import { DatabaseSync } from 'node:sqlite';

export const state = {
  database: null,
  calls: [],
  failures: new Map(),
  /** Outbound HTTP is scripted per test; see `setFetchHandler`. */
  fetchHandler: null,
  fetches: [],
};

/**
 * Script the next outbound HTTP calls.
 *
 * `handler(url, options)` returns (or resolves to):
 *   { status?, body }  — `body` is a string or an object (JSON-serialised)
 *   a rejected promise — a network-level failure
 *   a promise that never settles — a timeout
 *
 * Nothing here reaches the network: the point of the double is to prove what the
 * code does with a given answer, not to depend on a live service.
 */
export function setFetchHandler(handler) {
  state.fetchHandler = handler;
}

/**
 * Make the next call to one Bot API method throw, so the "stale button" and
 * "Telegram said no" paths can be exercised. One-shot: the call after it behaves
 * normally again.
 */
export function failNext(method, error) {
  state.failures.set(String(method), error);
  return error;
}

/** A BotApiError-shaped object, as the SDK would throw it. */
export function botApiError(code, description) {
  const error = new BotApiError(description);
  error.code = code;
  error.description = description;
  return error;
}

/** The Bot API double: records every call, answers with a plausible object. */
export const api = new Proxy(
  {},
  {
    get: (_target, method) => async (params) => {
      const failure = state.failures.get(String(method));
      if (failure) {
        state.failures.delete(String(method));
        state.calls.push([String(method), params, 'failed']);
        throw failure;
      }
      state.calls.push([String(method), params]);
      return { message_id: state.calls.length, chat: { id: params?.chat_id } };
    },
  },
);

export const calls = state.calls;

export class BotApiError extends Error {}

// ── sql`` template ───────────────────────────────────────────────────────────

export function sql(strings, ...values) {
  return { kind: 'sql', strings, values };
}
sql.raw = (text) => ({ kind: 'raw', text });

const isFragment = (value) => value && (value.kind === 'sql' || value.kind === 'raw');
const isColumn = (value) => value && value.__column === true;

/** `sql\`…\`` → { text, params } with `?` placeholders. */
export function compile(fragment) {
  if (fragment.kind === 'raw') return { text: fragment.text, params: [] };

  let text = '';
  const params = [];
  fragment.strings.forEach((chunk, index) => {
    text += chunk;
    if (index >= fragment.values.length) return;

    const value = fragment.values[index];
    if (isFragment(value)) {
      const inner = compile(value);
      text += inner.text;
      params.push(...inner.params);
    } else if (isColumn(value)) {
      text += `"${value.name}"`;
    } else {
      text += '?';
      params.push(normalizeValue(value));
    }
  });
  return { text, params };
}

function normalizeValue(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  return value;
}

function connection() {
  if (!state.database) throw new Error('test database not created');
  return state.database;
}

// ── db: raw SQL (the path the report/moderation code uses) ────────────────────

function all(fragment) {
  const { text, params } = compile(fragment);
  return connection().prepare(text).all(...params);
}

function get(fragment) {
  const { text, params } = compile(fragment);
  return connection().prepare(text).get(...params) ?? null;
}

function run(fragment) {
  const { text, params } = compile(fragment);
  // `.all()` also executes statements that return no rows; RETURNING rows come
  // back this way, which is what the SDK's `db.run` does too.
  const rows = connection().prepare(text).all(...params);
  const changes = connection().prepare('SELECT changes() AS c').get().c;
  const lastId = connection().prepare('SELECT last_insert_rowid() AS id').get().id;
  return { rowsAffected: changes, lastInsertRowid: lastId, rows };
}

// ── Schema DSL (enough of it for tgcloud/schema.js) ───────────────────────────

// NB: instance fields must not share a name with a builder method (an own
// property shadows the prototype method), hence the `isX` prefixes.
class Column {
  constructor(sqlName) {
    this.__column = true;
    this.name = sqlName;
    this.key = sqlName;
    this.type = 'TEXT';
    this.isNotNull = false;
    this.isUnique = false;
    this.isPrimaryKey = false;
    this.hasAutoIncrement = false;
    this.defaultValue = undefined;
    this.mode = null;
  }
  primaryKey({ autoIncrement } = {}) {
    this.isPrimaryKey = true;
    this.hasAutoIncrement = autoIncrement === true;
    return this;
  }
  notNull() { this.isNotNull = true; return this; }
  unique() { this.isUnique = true; return this; }
  default(value) { this.defaultValue = value; return this; }
}

const column = (type) => (name, opts = {}) => {
  const c = new Column(name);
  c.type = type;
  c.mode = opts.mode ?? null;
  return c;
};

export const integer = column('INTEGER');
export const text = column('TEXT');
export const boolean = (name) => {
  const c = column('INTEGER')(name);
  c.mode = 'boolean';
  return c;
};
export const real = column('REAL');
export const json = (name) => column('TEXT')(name);
export const index = (name) => ({ kind: 'index', name, columns: [], unique: false, on(...cols) { this.columns = cols; return this; } });
export const uniqueIndex = (name) => ({
  kind: 'index', name, columns: [], unique: true,
  on(...cols) { this.columns = cols; return this; },
});
export const check = (name, fragment) => ({ kind: 'check', name, fragment });
export const primaryKey = check;

export function table(sqlName, columns, extras) {
  const definition = { sqlName, columns: {}, indexes: [], checks: [] };
  for (const [key, col] of Object.entries(columns)) {
    col.key = key;
    definition.columns[key] = col;
    // The real SDK exposes columns as properties of the table (`products.id`);
    // do the same, which is how the query builder refers to them.
    if (!(key in definition)) definition[key] = col;
  }
  if (extras) {
    for (const constraint of Object.values(extras(definition))) {
      if (constraint?.kind === 'index') definition.indexes.push(constraint);
      else if (constraint?.kind === 'check') definition.checks.push(constraint);
    }
  }
  Object.defineProperty(definition, 'tableName', { value: sqlName, enumerable: false });
  return definition;
}

/** CREATE TABLE / CREATE INDEX statements for a schema module. */
export function schemaDdl(schemaModule) {
  const statements = [];
  for (const definition of Object.values(schemaModule)) {
    const parts = [];
    for (const col of Object.values(definition.columns)) {
      let part = `"${col.name}" ${col.type}`;
      if (col.isPrimaryKey) part += ' PRIMARY KEY';
      if (col.hasAutoIncrement) part += ' AUTOINCREMENT';
      if (col.isNotNull && !col.isPrimaryKey) part += ' NOT NULL';
      if (col.isUnique) part += ' UNIQUE';
      if (col.defaultValue !== undefined) part += ` DEFAULT ${renderDefault(col.defaultValue)}`;
      parts.push(part);
    }
    for (const constraint of definition.checks) {
      parts.push(`CONSTRAINT "${constraint.name}" CHECK (${compile(constraint.fragment).text})`);
    }
    statements.push(`CREATE TABLE "${definition.sqlName}" (\n  ${parts.join(',\n  ')}\n)`);

    for (const idx of definition.indexes) {
      const cols = idx.columns.map((col) => `"${col.name}"`).join(', ');
      statements.push(
        `CREATE ${idx.unique ? 'UNIQUE ' : ''}INDEX "${idx.name}" ON "${definition.sqlName}" (${cols})`,
      );
    }
  }
  return statements;
}

function renderDefault(value) {
  if (isFragment(value)) return compile(value).text;
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

// ── Query builder (used by catalog.js) ───────────────────────────────────────

const toRow = (definition, row) => {
  if (!row) return null;
  const mapped = {};
  for (const col of Object.values(definition.columns)) {
    const raw = row[col.name];
    mapped[col.key] = col.mode === 'boolean' ? raw === 1 : raw;
  }
  return mapped;
};

function matches(condition, row) {
  if (!condition) return true;
  if (condition.kind === 'and') return condition.parts.every((part) => matches(part, row));
  if (condition.kind === 'or') return condition.parts.some((part) => matches(part, row));

  const value = row[condition.column.key];
  if (condition.kind === 'eq') return value === condition.value;
  if (condition.kind === 'like') {
    const needle = String(condition.pattern).replaceAll('%', '');
    return value != null && String(value).includes(needle);
  }
  return true;
}

export const eq = (column, value) => ({ kind: 'eq', column, value });
export const like = (column, pattern) => ({ kind: 'like', column, pattern });
export const and = (...parts) => ({ kind: 'and', parts });
export const or = (...parts) => ({ kind: 'or', parts });
export const asc = (column) => ({ direction: 'asc', column });
export const desc = (column) => ({ direction: 'desc', column });

class Select {
  constructor() {
    this.method = 'select';
    this.options = { where: null, order: [], limit: Infinity, offset: 0 };
  }
  from(definition) { this.definition = definition; return this; }
  where(condition) { this.options.where = condition; return this; }
  orderBy(...order) { this.options.order = order; return this; }
  limit(n) { this.options.limit = n; return this; }
  offset(n) { this.options.offset = n; return this; }

  rows() {
    const raw = connection().prepare(`SELECT * FROM "${this.definition.sqlName}"`).all();
    let rows = raw.map((row) => toRow(this.definition, row)).filter((row) => matches(this.options.where, row));
    for (const { direction, column } of [...this.options.order].reverse()) {
      rows = [...rows].sort((a, b) => {
        const left = a[column.key];
        const right = b[column.key];
        if (left === right) return 0;
        return (left < right ? -1 : 1) * (direction === 'desc' ? -1 : 1);
      });
    }
    return rows.slice(this.options.offset, this.options.offset + this.options.limit);
  }
  async all() { return this.rows(); }
  async get() { return this.rows()[0] ?? null; }
  then(resolve, reject) { return this.all().then(resolve, reject); }
}

class Insert {
  constructor(definition) {
    this.definition = definition;
    this.batch = [];
    this.conflict = null;
    this.wantRows = false;
  }
  values(values) { this.batch = Array.isArray(values) ? values : [values]; return this; }
  // Only the behaviour the project actually uses is implemented. An unsupported
  // builder call is deliberately absent, so it throws instead of passing silently.
  onConflictDoNothing(options) { this.conflict = { target: options?.target }; return this; }
  returning() { this.wantRows = true; return this; }

  insertOne(values) {
    const cols = [];
    const params = [];
    for (const col of Object.values(this.definition.columns)) {
      if (!(col.key in values)) continue;
      cols.push(`"${col.name}"`);
      params.push(normalizeValue(values[col.key]));
    }
    let text = `INSERT INTO "${this.definition.sqlName}" (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
    if (this.conflict?.target) text += ` ON CONFLICT ("${this.conflict.target.name}") DO NOTHING`;
    const rows = connection().prepare(`${text} RETURNING *`).all(...params);
    return rows.map((row) => toRow(this.definition, row));
  }

  async run() {
    const rows = [];
    let affected = 0;
    for (const values of this.batch) {
      const inserted = this.insertOne(values);
      affected += inserted.length;
      rows.push(...inserted);
    }
    return this.wantRows ? rows : { rowsAffected: affected, lastInsertRowid: 0, rows: [] };
  }
  then(resolve, reject) { return this.run().then(resolve, reject); }
}

export const db = {
  select: () => new Select(),
  insert: (definition) => new Insert(definition),
  async $count(definition, condition) {
    const raw = connection().prepare(`SELECT * FROM "${definition.sqlName}"`).all();
    return raw.map((row) => toRow(definition, row)).filter((row) => matches(condition, row)).length;
  },
  run,
  all,
  get,
};

/** A scripted `fetch`: records the request, answers from `state.fetchHandler`. */
export const fetch = async (url, options) => {
  state.fetches.push({ url: String(url), options });
  if (!state.fetchHandler) {
    throw new Error('fetch was called but no handler was installed for this test');
  }

  const answer = await state.fetchHandler(String(url), options);
  const status = answer.status ?? 200;
  const body = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body ?? null);
  const used = { bodyRead: false };

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    url: String(url),
    headers: { get: () => 'application/json', has: () => true, keys: () => [], entries: () => [] },
    async text() {
      if (used.bodyRead) throw new TypeError('body used already');
      used.bodyRead = true;
      return body;
    },
    async json() {
      return JSON.parse(await this.text());
    },
  };
};
export class InputFile {}
export class EndpointError {}
