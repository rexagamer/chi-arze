import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OUTLIER, SUMMARY } from '../tgcloud/lib/config.js';
import {
  countContributors,
  freshness,
  median,
  priceDeviation,
  summarizeApproved,
} from '../tgcloud/lib/summary.js';

const row = (userId, priceToman) => ({ userId, priceToman });

test('median handles odd, even and empty samples', () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([300, 100, 200]), 200);
  assert.equal(median([100, 200, 300, 400]), 250);
  assert.equal(median([100, 201, 300, 400]), 251); // rounded to whole toman
  assert.equal(median([100, 100, 100]), 100);
});

test('contributors are counted per person, not per report', () => {
  const rows = [row(1, 100), row(1, 120), row(2, 90)];
  assert.equal(countContributors(rows), 2);
  assert.equal(countContributors([]), 0);
});

test('a median is withheld until enough different people reported', () => {
  const onePersonRepeating = [row(1, 100), row(1, 110), row(1, 120)];
  const summary = summarizeApproved(onePersonRepeating);

  assert.equal(summary.count, 3);
  assert.equal(summary.contributors, 1);
  assert.equal(summary.median, 110); // still computed…
  assert.equal(summary.showMedian, false); // …but not shown
  assert.equal(summary.showRange, false);
});

test('three independent contributors are enough for a median and a range', () => {
  const summary = summarizeApproved([row(1, 100), row(2, 200), row(3, 300)]);

  assert.equal(summary.showMedian, true);
  assert.equal(summary.median, 200);
  assert.equal(summary.showRange, true);
  assert.equal(summary.min, 100);
  assert.equal(summary.max, 300);
});

test('two contributors show a range but still no median', () => {
  const summary = summarizeApproved([row(1, 100), row(2, 200)]);
  assert.equal(SUMMARY.minContributorsForMedian, 3);
  assert.equal(summary.showMedian, false);
  assert.equal(summary.showRange, true);
});

test('freshness turns stale after the configured window', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  const daysAgo = (days) => new Date(now.getTime() - days * 86_400_000);

  const fresh = freshness(daysAgo(SUMMARY.staleAfterDays), now);
  assert.equal(fresh.isStale, false);
  assert.equal(fresh.days, SUMMARY.staleAfterDays);

  const stale = freshness(daysAgo(SUMMARY.staleAfterDays + 1), now);
  assert.equal(stale.isStale, true);

  assert.deepEqual(freshness(null, now), { days: null, isStale: true });
});

test('outlier detection stays silent on small samples', () => {
  const small = Array(OUTLIER.minSample - 1).fill(1000);
  assert.equal(priceDeviation(999_999, small), null);
  assert.equal(priceDeviation(1000, []), null);
});

test('outlier detection flags a price far from the median but never decides', () => {
  const sample = [1000, 1000, 1000, 1000, 1000];
  const far = priceDeviation(3000, sample);

  assert.equal(far.isUnusual, true);
  assert.equal(far.median, 1000);
  assert.equal(far.sampleSize, sample.length);
  // A verdict is not part of the result: this can only ever be advice.
  assert.equal('reject' in far, false);

  const close = priceDeviation(1100, sample);
  assert.equal(close.isUnusual, false);
});
