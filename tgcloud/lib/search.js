// Pure search helpers: turning a query into LIKE patterns, and ordering the rows
// the database matched. Kept apart from `catalog.js` so the ranking rules can be
// tested without the platform SDK.

import { normalizeText, tokenize } from './normalize.js';
import { SEARCH } from './config.js';

/**
 * The words a query must match, normalized and capped. Empty for a blank query,
 * which callers treat as "nothing to search for" rather than "match everything".
 */
export function queryTokens(query) {
  return tokenize(query, SEARCH.maxTokens);
}

/**
 * `%term%` for each token — the SQL `LIKE` pattern for a substring match.
 * Safe to interpolate: tokens come from `normalizeText`, which reduces every
 * symbol (including `%` and `_`) to a space, so a token can never carry a
 * wildcard of its own.
 */
export function likePatterns(tokens) {
  return tokens.map((token) => `%${token}%`);
}

/**
 * Order matched rows by how well they match, best first:
 *   3 — the product name is exactly the query;
 *   2 — every query word appears in the product name;
 *   1 — matched only through keywords/aliases.
 * Ties keep catalog order (ascending id), so results are stable across runs.
 * The returned rows are the input rows untouched.
 */
export function rankMatches(rows, query) {
  const normalized = normalizeText(query);
  const tokens = queryTokens(normalized);
  if (!tokens.length) return [];

  return rows
    .map((row, index) => ({ row, index, score: scoreRow(row, normalized, tokens) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.row);
}

function scoreRow(row, normalizedQuery, tokens) {
  const name = row.normalizedName ?? '';
  if (name === normalizedQuery) return 3;
  return tokens.every((token) => name.includes(token)) ? 2 : 1;
}
