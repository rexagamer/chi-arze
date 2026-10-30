// The HTTP boundary for Torob: one place that builds URLs, calls `fetch` from
// the platform SDK, and turns every failure into an error code.
//
// Nothing here parses a response (that is `torob-parse.js`) and nothing here
// caches (that is `torob.js`). The job of this module is to make a network call
// that can *only* do bounded work: one attempt, a hard timeout, a byte ceiling,
// and never a retry loop that could turn a slow upstream into a flood.
//
// THE RUNTIME IS NOT A BROWSER. It is a bare V8 isolate: language built-ins
// (`encodeURIComponent`, `JSON`, `Date`, `Promise`) exist, host APIs do not.
// Measured with `tgcloud run`, `URL`, `URLSearchParams`, `setTimeout`,
// `clearTimeout` and `queueMicrotask` are all `undefined`. Everything below is
// written against that measured surface — no `URL`, no timers as a hard
// requirement — because a missing global throws at call time, before any request
// is made, and the user just sees a generic error.

import { fetch } from 'sdk';
import { TOROB } from './config.js';

/** Timeout for one upstream call. */
const timeoutMs = () => TOROB.timeoutMs;

/**
 * Can this runtime keep time? Measured, not assumed: the isolate has no
 * `setTimeout`, so on the platform this is false and requests run unbounded.
 */
export const hasTimers = () => typeof setTimeout === 'function' && typeof clearTimeout === 'function';

/**
 * Bound a promise with a timer — when the runtime has timers.
 *
 * `AbortSignal` is not documented for the platform's `fetch`, so the timeout is a
 * race rather than a signal. The losing promise is left to settle on its own — an
 * invocation that has already answered is finished either way.
 *
 * Without timers the promise is returned unchanged. A missing deadline is a
 * smaller problem than every request failing before it starts: the platform's own
 * request timeout still applies, and the caller reports the failure it gets.
 */
function withTimeout(promise) {
  if (!hasTimers()) return promise;
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('torob timeout'), { code: 'TIMEOUT' })), timeoutMs());
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * `application/x-www-form-urlencoded`, from built-ins only.
 *
 * `encodeURIComponent` turns a space into `%20`, where `URLSearchParams` would
 * use `+`. Both are valid in a query string and Torob accepts either; `%20` has
 * the advantage of never being confused with a literal plus sign in a query.
 */
function formEncode(pairs) {
  return pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/** The search URL for a query. `q` is the parameter the API actually honours. */
export function searchUrl(query, { page = 0, size = TOROB.requestSize } = {}) {
  return `${TOROB.origin}/v4/base-product/search/?${formEncode([
    ['page', page],
    ['size', size],
    ['q', query],
  ])}`;
}

/** The sellers URL for one product key. */
export function sellersUrl(prk) {
  return `${TOROB.origin}/v4/base-product/sellers/?${formEncode([
    ['prk', prk],
    ['list_type', 'products_info'],
  ])}`;
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
