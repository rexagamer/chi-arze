// The bot, run in a runtime that matches the Serverless isolate's capabilities.
//
// Measured with `tgcloud run` on the platform, the isolate has no `URL`, no
// `URLSearchParams` and no timers. Node has all three, and that gap shipped a
// release: the first version of the Torob client called `new URLSearchParams(...)`
// inside `searchUrl`, which threw a ReferenceError before any request was made,
// and 160 green local tests said nothing about it.
//
// So the surrogate runtime lives in `tests/support/constrained-runtime.mjs`: the
// real app, real SQLite, real handlers — with those globals deleted before the
// messages are dispatched. These tests assert on what it prints.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/** Runs the constrained child once; parsing its single JSON line. */
function runConstrained() {
  const stdout = execFileSync(process.execPath, ['--no-warnings', 'tests/support/constrained-runtime.mjs'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout.trim().split('\n').at(-1));
}

const result = runConstrained();

test('the child really does run without URL, URLSearchParams or timers', () => {
  assert.deepEqual(result.deleted, {
    URL: 'undefined',
    URLSearchParams: 'undefined',
    setTimeout: 'undefined',
    clearTimeout: 'undefined',
  });
});

test('a search reaches Torob and renders offers without those globals', () => {
  // The bug was a ReferenceError inside searchUrl, which surfaces as either the
  // generic error or a "no connection" message. Neither is acceptable.
  assert.doesNotMatch(result.search.text, /مشکلی پیش آمد/);
  assert.doesNotMatch(result.search.text, /ارتباط با ترب برقرار نشد/);
  assert.match(result.search.text, /نتایج «شارژر سامسونگ»/);
  assert.match(result.search.text, /۳٬۴۵۲٬۰۰۰ تومان/);
});

test('the query is encoded with built-ins, so no query string is needed to build it', () => {
  assert.equal(result.search.fetches.length, 1);
  const url = result.search.fetches[0];
  assert.match(url, /^https:\/\/api\.torob\.com\/v4\/base-product\/search\/\?page=0&size=8&q=/);
  // `encodeURIComponent` writes a space as %20; URLSearchParams would write "+".
  assert.match(url, /q=%D8%B4%D8%A7%D8%B1%DA%98%D8%B1%20%D8%B3%D8%A7%D9%85%D8%B3%D9%88%D9%86%DA%AF$/);
  assert.equal(decodeURIComponent(url.split('q=')[1]), 'شارژر سامسونگ');
});

test('a repeated search still answers — the cache path needs no timers either', () => {
  assert.equal(result.secondSearch.screens, 2); // the second call edited, it did not fail
  assert.match(result.secondSearch.text, /نتایج «شارژر سامسونگ»/);
});

test('a report with a source link is accepted, not rejected as an invalid URL', () => {
  // `parseSourceUrl` used `new URL`, which is absent: its `catch` turned every
  // link into URL_INVALID instead of throwing, so this failed silently.
  assert.match(result.report.text, /گزارش شما ثبت شد/);
  assert.doesNotMatch(result.report.text, /لینک منبع معتبر نیست/);
  assert.match(result.report.text, /https:\/\/shop\.example\/p\/1/); // host lower-cased, path kept
});
