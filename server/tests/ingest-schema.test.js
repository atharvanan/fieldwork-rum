import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBatch } from '../src/validators/ingest.js';

const ok = { type: 'vital', name: 'LCP', value: 1800, path: '/', sessionId: 's1' };

test('accepts a valid batch', () => {
  const out = parseBatch({ key: 'rum_abcdefgh', events: [ok, { type: 'pageview', path: '/', sessionId: 's1' }] });
  assert.equal(out.events.length, 2);
  assert.equal(out.dropped, 0);
});

test('drops bad events but keeps the rest of the batch', () => {
  const out = parseBatch({
    key: 'rum_abcdefgh',
    events: [ok, { type: 'vital', name: 'LCP', value: -5, path: '/', sessionId: 's1' }, { type: 'nope' }],
  });
  assert.equal(out.events.length, 1);
  assert.equal(out.dropped, 2);
});

test('rejects unknown vital names', () => {
  const out = parseBatch({ key: 'rum_abcdefgh', events: [{ ...ok, name: 'FOO' }] });
  assert.equal(out.events.length, 0);
});

test('rejects a bad envelope', () => {
  assert.throws(() => parseBatch({ key: 'x', events: [] }));
  assert.throws(() => parseBatch({ key: 'rum_abcdefgh', events: new Array(51).fill(ok) }));
  assert.throws(() => parseBatch(null));
});
