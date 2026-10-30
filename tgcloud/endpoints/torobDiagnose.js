// TEMPORARY DIAGNOSTIC — run it, read it, delete it.
//
//   npx tgcloud run endpoints/torobDiagnose '{}'
//
// Reads the runtime's real capabilities and makes one real request, so the
// question "can this bot reach Torob, and does the client work here?" is answered
// by measurement instead of assumption.
//
// Two things learned the hard way, and honoured below:
//   • dynamic `import()` is not supported in the runtime ("Not supported"), so
//     every import is static;
//   • `URL`, `URLSearchParams`, `setTimeout` and `clearTimeout` do not exist, so
//     nothing here may use them.
//
// It returns no token, no user and no database row — one public search and the
// shape of its answer. Delete this file once the question is settled: as an
// endpoint it would be publicly callable once deployed.

import { fetch } from 'sdk';

import { getJson, searchUrl, sellersUrl } from '../lib/torob-client.js';
import { searchOffers } from '../lib/torob.js';
import { parseSourceUrl } from '../lib/report-input.js';

/** A literal URL: the only way to test connectivity without involving our code. */
const RAW_URL =
  'https://api.torob.com/v4/base-product/search/?page=0&size=3&q=%D8%B4%D8%A7%D8%B1%DA%98%D8%B1%20%D8%B3%D8%A7%D9%85%D8%B3%D9%88%D9%86%DA%AF';

/** The building blocks the code relies on, and the host APIs it must not need. */
const CAPABILITIES = [
  'encodeURIComponent',
  'decodeURIComponent',
  'JSON',
  'Date',
  'Promise',
  'Map',
  'Set',
  'Symbol',
  'BigInt',
  'fetch',
  'URL',
  'URLSearchParams',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'queueMicrotask',
  'structuredClone',
  'AbortController',
  'TextEncoder',
  'TextDecoder',
  'Intl',
  'crypto',
  'process',
];

function capabilities() {
  const found = {};
  for (const name of CAPABILITIES) {
    try {
      found[name] = typeof globalThis[name];
    } catch (error) {
      found[name] = `throws: ${String(error && error.message).slice(0, 60)}`;
    }
  }
  found.sdkFetch = typeof fetch;
  return found;
}

function short(value, limit = 200) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function describeError(error) {
  return {
    name: short(error && error.name, 60),
    message: short(error && error.message),
    cause: error && error.cause ? short(error.cause.code || error.cause.message || error.cause) : null,
  };
}

/** One real GET, observed as far as the response object allows. */
async function probeRaw() {
  const startedAt = Date.now();
  const report = { url: RAW_URL };

  try {
    const response = await fetch(RAW_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    report.ms = Date.now() - startedAt;
    report.ok = response.ok;
    report.status = response.status;
    report.statusText = short(response.statusText, 60);
    report.contentType = response.headers && response.headers.get ? response.headers.get('content-type') : null;

    const text = await response.text();
    report.chars = typeof text === 'string' ? text.length : null;
    report.head = short(text, 160);

    let payload = null;
    try {
      payload = JSON.parse(text);
      report.jsonValid = true;
    } catch (error) {
      report.jsonValid = false;
      report.jsonError = short(error && error.message, 80);
    }

    report.results = Array.isArray(payload && payload.results) ? payload.results.length : null;
    const first = report.results ? payload.results[0] : null;
    report.first = first
      ? {
          name: short(first.name1, 60),
          price: Number.isFinite(first.price) ? first.price : null,
          prk: typeof first.random_key === 'string',
          url: Boolean(first.web_client_absolute_url),
        }
      : null;
  } catch (error) {
    report.ms = Date.now() - startedAt;
    report.error = describeError(error);
  }

  return report;
}

/** The URL builders on their own: pure string work, no request. */
function probeUrls() {
  const startedAt = Date.now();
  try {
    return {
      ms: Date.now() - startedAt,
      search: searchUrl('شارژر سامسونگ', { size: 3 }),
      sellers: sellersUrl('d92e497e-52aa-4f6e-ba9e-26664ae2368f'),
      report: parseSourceUrl('https://shop.example/p/1'),
    };
  } catch (error) {
    return { ms: Date.now() - startedAt, threw: describeError(error) };
  }
}

/** The client against a literal URL — separates a URL bug from a fetch bug. */
async function probeClient() {
  const startedAt = Date.now();
  try {
    const result = await getJson(RAW_URL);
    return {
      ms: Date.now() - startedAt,
      ok: result.ok,
      error: result.ok ? null : result.error,
      status: result.status ?? null,
      results: result.ok ? (result.payload.results || []).length : null,
    };
  } catch (error) {
    return { ms: Date.now() - startedAt, threw: describeError(error) };
  }
}

/** The whole integration, as a user's search would run it. */
async function probeIntegration() {
  const startedAt = Date.now();
  try {
    const result = await searchOffers('شارژر سامسونگ');
    return {
      ms: Date.now() - startedAt,
      ok: result.ok,
      error: result.ok ? null : result.error,
      cached: result.cached === undefined ? null : result.cached,
      products: result.ok ? result.products.length : null,
      first: result.ok && result.products[0]
        ? {
            name: short(result.products[0].name, 60),
            priceToman: result.products[0].priceToman,
            url: Boolean(result.products[0].url),
          }
        : null,
    };
  } catch (error) {
    return { ms: Date.now() - startedAt, threw: describeError(error) };
  }
}

/** A category, so the output reads as a diagnosis instead of a data dump. */
function verdict({ raw, client, integration }) {
  if (raw && raw.error) {
    const message = `${raw.error.message} ${raw.error.cause || ''}`.toLowerCase();
    if (/enotfound|eai_again|getaddrinfo|dns/.test(message)) return 'A — DNS failure';
    if (/certificate|tls|ssl|handshake|self.signed/.test(message)) return 'B — TLS failure';
    return 'A/G — the request did not leave the runtime (read raw.error)';
  }
  if (raw && raw.ok === false) return `C — Torob answered HTTP ${raw.status}`;
  if (raw && raw.jsonValid === false) return 'E — the body is not JSON';
  if (raw && raw.results === null) return 'E — JSON without a results array';
  if (client && client.threw) return `F — getJson threw: ${client.threw.message}`;
  if (client && !client.ok) return `F — the client rejects a URL the network accepts (${client.error})`;
  if (integration && integration.threw) return `F — searchOffers threw: ${integration.threw.message}`;
  if (integration && !integration.ok) return `F — searchOffers fails while the raw request succeeds (${integration.error})`;
  return 'OK — the runtime reaches Torob and the integration renders products';
}

export default async function torobDiagnose() {
  const startedAt = Date.now();

  const caps = capabilities();
  const urls = probeUrls();
  const raw = await probeRaw();

  // The two module probes cost two more requests, so only run them when the first
  // request actually reached the network. Repeating it at a host that just refused
  // us would add load and no information.
  const reachable = !raw.error;
  const client = reachable ? await probeClient() : { skipped: 'the raw request failed' };
  const integration = reachable ? await probeIntegration() : { skipped: 'the raw request failed' };

  const report = {
    verdict: verdict({ raw, client, integration }),
    totalMs: Date.now() - startedAt,
    capabilities: caps,
    urls,
    raw,
    client,
    integration,
  };

  // One compact log line, so the finding survives even a truncated return value.
  console.log('torobDiagnose:', report.verdict, {
    status: raw.status ?? null,
    rawError: raw.error ?? null,
    clientError: client.error ?? client.threw ?? null,
    integrationError: integration.error ?? integration.threw ?? null,
    totalMs: report.totalMs,
  });

  return report;
}
