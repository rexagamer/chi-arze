// The HTTP boundary for Torob: one place that builds URLs, calls `fetch` from
// the platform SDK, and turns every failure into an error code.
//
// Nothing here parses a response (that is `torob-parse.js`) and nothing here
// caches (that is `torob.js`). The job of this module is to make a network call
// that can *only* do bounded work: one attempt, a hard timeout, a byte ceiling,
// and never a retry loop that could turn a slow upstream into a flood.

import { fetch } from 'sdk';
import { TOROB } from './config.js';

/** Timeout for one upstream call. */
const timeoutMs = () => TOROB.timeoutMs;

/**
 * A `Request`-like cancellation that works whatever the runtime supports.
 *
 * `AbortSignal` is not documented for the platform's `fetch`, so the timeout is
 * enforced by racing the request against a timer rather than by trusting the
 * signal. The losing promise is left to settle on its own — an invocation that
 * has already answered is finished either way — and `.catch` keeps an abandoned
 * rejection from escaping as an unhandled rejection.
 */
function withTimeout(promise) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('torob timeout'), { code: 'TIMEOUT' })), timeoutMs());
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** The search URL for a query. `q` is the parameter the API actually honours. */
export function searchUrl(query, { page = 0, size = TOROB.requestSize } = {}) {
  const params = new URLSearchParams({ page: String(page), size: String(size), q: query });
  return `${TOROB.origin}/v4/base-product/search/?${params.toString()}`;
}

/** The sellers URL for one product key. */
export function sellersUrl(prk) {
  const params = new URLSearchParams({ prk, list_type: 'products_info' });
  return `${TOROB.origin}/v4/base-product/sellers/?${params.toString()}`;
}

/**
 * GET a JSON document.
 *
 * Resolves `{ ok: true, payload }` or `{ ok: false, error }` — it never throws
 * for an upstream problem, because the caller has to render a Persian message
 * for each case and a throw would just be re-caught one level up.
 *
 * Error codes: TIMEOUT, NETWORK, HTTP_STATUS, BAD_CONTENT, TOO_LARGE,
 * BAD_JSON.
 */
export async function getJson(url) {
  let response;
  try {
    response = await withTimeout(
      fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          // An honest agent string: this is a small bot, not a browser.
          'User-Agent': TOROB.userAgent,
        },
      }),
    );
  } catch (error) {
    const code = error?.code === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK';
    console.warn('torob request failed', { code, url, reason: error?.message ?? String(error) });
    return { ok: false, error: code };
  }

  if (!response?.ok) {
    // 429 is worth its own message: it means "slow down", not "wrong request".
    const status = response?.status;
    console.warn('torob answered with an error status', { status, url });
    return { ok: false, error: status === 429 ? 'RATE_LIMITED' : 'HTTP_STATUS', status };
  }

  // Read the body as text first: an HTML block page has to be distinguishable
  // from a genuine empty answer, and the size ceiling needs a length rather than
  // a stream.
  let text;
  try {
    text = await withTimeout(response.text());
  } catch (error) {
    const code = error?.code === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK';
    console.warn('torob body could not be read', { code, url, reason: error?.message ?? String(error) });
    return { ok: false, error: code };
  }

  if (typeof text !== 'string') return { ok: false, error: 'BAD_CONTENT' };
  if (text.length > TOROB.maxResponseChars) {
    console.warn('torob response was too large', { chars: text.length, url });
    return { ok: false, error: 'TOO_LARGE' };
  }

  try {
    return { ok: true, payload: JSON.parse(text) };
  } catch {
    // Almost always an HTML interstitial; the first bytes say which.
    console.warn('torob answered with something that is not JSON', {
      url,
      preview: text.slice(0, 120).replace(/\s+/g, ' '),
    });
    return { ok: false, error: 'BAD_JSON' };
  }
}
