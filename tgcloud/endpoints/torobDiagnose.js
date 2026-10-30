// TEMPORARY DIAGNOSTIC — run it, read it, then delete it.
//
//   npx tgcloud run endpoints/torobDiagnose '{}'
//
// `tgcloud run` uploads the local modules and executes them in the cloud, so this
// request leaves from the platform's network — not from the developer's machine,
// and not from a mock. That is the only way to answer "can the bot reach Torob?".
//
// It makes one real GET, then (only if that one got an answer at all) the same
// call through the two project modules, and returns what it saw. Nothing secret
// is read or returned: no token, no user, no database row — one public search and
// the shape of its answer. Safe to keep in a private repo, but it would become a
// reachable endpoint once deployed, so do not ship it.

const RAW_URL =
  'https://api.torob.com/v4/base-product/search/?q=%D8%B4%D8%A7%D8%B1%DA%98%D8%B1%20%D8%B3%D8%A7%D9%85%D8%B3%D9%88%D9%86%DA%AF&page=0&size=3';

/** How long one probe may take before it is reported as a timeout. */
const BUDGET_MS = 12_000;

/** Globals the integration assumes without them being documented. */
const PROBED_GLOBALS = [
  'fetch',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'queueMicrotask',
  'URL',
  'URLSearchParams',
  'AbortController',
  'AbortSignal',
  'TextEncoder',
  'TextDecoder',
  'structuredClone',
  'crypto',
  'process',
  'Deno',
  'Bun',
];

/** Short, single-line, preview-only — safe to paste into a chat or an issue. */
function sanitize(value, limit = 240) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function describeError(error) {
  return {
    name: sanitize(error?.name ?? 'Error', 60),
    message: sanitize(error?.message),
    code: error?.code == null ? null : sanitize(error.code, 40),
    // `fetch` failures usually carry the useful part in `cause`.
    cause:
      error?.cause == null
        ? null
        : sanitize([error.cause.code, error.cause.message].filter(Boolean).join(' / ') || String(error.cause)),
  };
}

/**
 * Bound a promise with a timer — but only if the runtime has one. A missing
 * `setTimeout` is itself a finding, and it must not stop the probe.
 */
async function withBudget(promise, ms = BUDGET_MS) {
  if (typeof setTimeout !== 'function') return promise;
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error(`no answer within ${ms} ms`), { code: 'TIMEOUT' })),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function environment() {
  const types = {};
  for (const name of PROBED_GLOBALS) {
    try {
      types[name] = typeof globalThis[name];
    } catch (error) {
      types[name] = `throws: ${sanitize(error?.message, 60)}`;
    }
  }
  return types;
}

/** One real GET with the URL the integration would build, fully observed. */
async function probeRawRequest(sdkFetch) {
  const startedAt = Date.now();
  const report = { url: RAW_URL };

  try {
    const response = await withBudget(
      sdkFetch(RAW_URL, { method: 'GET', headers: { Accept: 'application/json' } }),
    );
    report.elapsedMs = Date.now() - startedAt;
    report.ok = response?.ok ?? null;
    report.status = response?.status ?? null;
    report.statusText = sanitize(response?.statusText, 80);
    report.finalUrl = sanitize(response?.url, 300);
    report.contentType = response?.headers?.get?.('content-type') ?? null;

    const text = await withBudget(response.text());
    report.bodyType = typeof text;
    report.chars = typeof text === 'string' ? text.length : null;
    report.head = sanitize(text);

    try {
      const payload = JSON.parse(text);
      report.jsonValid = true;
      report.resultsIsArray = Array.isArray(payload?.results);
      report.resultsCount = report.resultsIsArray ? payload.results.length : null;
      report.countField = Number.isFinite(payload?.count) ? payload.count : null;

      const first = report.resultsIsArray ? payload.results[0] : null;
      report.firstResult = first
        ? {
            name: sanitize(first.name1, 80),
            priceToman: Number.isFinite(first.price) ? first.price : null,
            hasProductKey: typeof first.random_key === 'string',
            hasProductUrl: Boolean(first.web_client_absolute_url),
            shopText: sanitize(first.shop_text, 60),
          }
        : null;
    } catch (error) {
      report.jsonValid = false;
      report.jsonError = sanitize(error?.message);
    }
  } catch (error) {
    report.elapsedMs = Date.now() - startedAt;
    report.error = describeError(error);
  }

  return report;
}

/** Load a module in isolation: a broken import must not hide the other probes. */
async function probeImport(specifier) {
  const startedAt = Date.now();
  try {
    const module = await import(specifier);
    return {
      specifier,
      loaded: true,
      elapsedMs: Date.now() - startedAt,
      exports: Object.keys(module).sort().slice(0, 30),
    };
  } catch (error) {
    return { specifier, loaded: false, elapsedMs: Date.now() - startedAt, error: describeError(error) };
  }
}

/** The existing client, called with the query the integration would send. */
async function probeClient() {
  const startedAt = Date.now();
  try {
    const client = await import('../lib/torob-client.js');
    const url = client.searchUrl('شارژر سامسونگ', { size: 3 });
    const result = await withBudget(client.getJson(url));
    return {
      elapsedMs: Date.now() - startedAt,
      ok: result?.ok === true,
      error: result?.ok ? null : (result?.error ?? 'unknown'),
      status: result?.status ?? null,
      resultsInPayload: result?.ok ? (result.payload?.results?.length ?? null) : null,
    };
  } catch (error) {
    return { elapsedMs: Date.now() - startedAt, ok: false, error: describeError(error) };
  }
}

/** The whole integration: cache read, HTTP, parse, trim. */
async function probeIntegration() {
  const startedAt = Date.now();
  try {
    const torob = await import('../lib/torob.js');
    const result = await withBudget(torob.searchOffers('شارژر سامسونگ'));
    return {
      elapsedMs: Date.now() - startedAt,
      ok: result?.ok === true,
      error: result?.ok ? null : (result?.error ?? 'unknown'),
      cached: result?.cached ?? null,
      productCount: result?.products?.length ?? null,
      firstProduct: result?.products?.[0]
        ? {
            name: sanitize(result.products[0].name, 80),
            priceToman: result.products[0].priceToman ?? null,
            hasUrl: Boolean(result.products[0].url),
          }
        : null,
    };
  } catch (error) {
    return { elapsedMs: Date.now() - startedAt, ok: false, error: describeError(error) };
  }
}

/** A first guess at the category, so the report reads as a diagnosis. */
function classify(report) {
  if (report.sdk?.loaded === false) return 'G — `sdk` itself failed to load (see sdk.error)';
  if (report.sdk?.fetchType !== 'function') return 'G — `sdk` does not expose `fetch` here';
  if (!report.raw) return 'F — the raw probe did not run';
  if (report.raw.error) {
    const message = `${report.raw.error.message} ${report.raw.error.cause ?? ''}`.toLowerCase();
    if (report.raw.error.code === 'TIMEOUT') return 'D — no answer within the budget (timeout)';
    if (/enotfound|eai_again|name_not_resolved|getaddrinfo|dns/.test(message)) return 'A — DNS';
    if (/certificate|tls|ssl|handshake|self.signed/.test(message)) return 'B — TLS/SSL';
    return 'A/G — network-level rejection (read raw.error above)';
  }
  if (report.raw.ok === false) return `C — Torob answered HTTP ${report.raw.status}`;
  if (report.raw.jsonValid === false) return 'E — the body is not JSON';
  if (report.raw.resultsIsArray !== true) return 'E — JSON without a `results` array';
  if (report.integration?.skipped) return 'F — raw works, integration skipped? (unexpected)';
  if (report.integration?.ok) return 'OK — the runtime reaches Torob and the integration parses it';
  return 'F — the raw request works, so the failure is inside the integration';
}

export default async function torobDiagnose() {
  const startedAt = Date.now();
  const env = environment();

  // `sdk` first: if it is missing, nothing else is about the network.
  const sdkModule = await probeImport('sdk');
  let sdkFetch = null;
  try {
    sdkFetch = sdkModule.loaded ? (await import('sdk')).fetch : null;
  } catch (error) {
    sdkModule.error = describeError(error);
  }
  const sdk = { ...sdkModule, fetchType: typeof sdkFetch };

  let raw = null;
  let clientModule = null;
  let client = null;
  let integrationModule = null;
  let integration = null;

  if (typeof sdkFetch === 'function') {
    raw = await probeRawRequest(sdkFetch);

    // Imported either way: a load-time failure is a different bug from a failed
    // request, and it must not be hidden by an early return.
    clientModule = await probeImport('../lib/torob-client.js');
    integrationModule = await probeImport('../lib/torob.js');

    // The two module probes cost two more requests, so they only make sense if
    // the first request left the runtime at all. If it did not, they would fail
    // identically — and repeating it is load on a host that already refused us.
    const reachable = !raw?.error;
    client = clientModule.loaded
      ? reachable ? await probeClient() : { skipped: 'raw request failed' }
      : null;
    integration = integrationModule.loaded
      ? reachable ? await probeIntegration() : { skipped: 'raw request failed' }
      : null;
  }

  const totalMs = Date.now() - startedAt;
  const verdict = classify({ sdk, raw, integration });

  // One line in the log, so the finding survives even a truncated return.
  console.log('torob diagnostic:', verdict, {
    setTimeout: env.setTimeout,
    status: raw?.status ?? null,
    rawError: raw?.error ?? null,
    clientError: client?.error ?? null,
    integrationError: integration?.error ?? null,
    totalMs,
  });

  return {
    verdict,
    totalMs,
    environment: env,
    sdk,
    raw,
    clientModule,
    client,
    integrationModule,
    integration,
  };
}
