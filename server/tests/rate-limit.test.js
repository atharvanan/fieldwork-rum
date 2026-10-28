import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allow } from '../src/services/keyRateLimit.js';

test('allows up to the limit per minute, then blocks', () => {
  const key = `k-${Math.random()}`;
  for (let i = 0; i < 3; i += 1) assert.equal(allow(key, 3), true);
  assert.equal(allow(key, 3), false);
  assert.equal(allow(`other-${Math.random()}`, 3), true);
});
