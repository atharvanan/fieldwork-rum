import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateVital } from '../src/utils/rating.js';

test('rates values against Core Web Vitals thresholds', () => {
  assert.equal(rateVital('LCP', 2500), 'good');
  assert.equal(rateVital('LCP', 2501), 'needs-improvement');
  assert.equal(rateVital('LCP', 4001), 'poor');
  assert.equal(rateVital('CLS', 0.05), 'good');
  assert.equal(rateVital('CLS', 0.3), 'poor');
  assert.equal(rateVital('INP', 200), 'good');
});

test('unknown metrics have no rating', () => {
  assert.equal(rateVital('NOPE', 1), undefined);
});
