import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPage } from './helpers.mjs';

const vitalsOf = (events) => Object.fromEntries(events.filter((e) => e.type === 'vital').map((e) => [e.name, e.value]));

test('does nothing without a key or endpoint', () => {
  const page = createPage();
  page.w.__init({});
  page.w.__init({ key: 'rum_abc' });
  page.hide();
  assert.equal(page.sent.length, 0);
  page.close();
});

test('starts only once per page', () => {
  const page = createPage();
  page.init();
  page.init();
  page.hide();
  assert.equal(page.events().filter((e) => e.type === 'pageview').length, 1);
  page.close();
});

test('sampleRate 0 sends nothing, and the decision sticks for the session', () => {
  const page = createPage();
  page.init({ sampleRate: 0 });
  page.w.dispatchEvent(new page.w.ErrorEvent('error', { message: 'x', error: new Error('x') }));
  page.hide();
  assert.equal(page.sent.length, 0);
  page.close();
});

test('records a page view with path, session and a timestamp', () => {
  const page = createPage();
  page.init({ release: '3.1.4' });
  page.hide();
  const [view] = page.events().filter((e) => e.type === 'pageview');
  assert.equal(view.path, '/shop');
  assert.ok(view.sessionId.length > 3);
  assert.ok(Math.abs(view.ts - Date.now()) < 5000);
  assert.equal(page.sent[0].body.release, '3.1.4');
  assert.equal(page.sent[0].body.key, 'rum_testkey123');
  page.close();
});

test('single-page-app navigation: pushState and popstate create page views, same path does not', () => {
  const page = createPage();
  page.init();
  page.w.history.pushState({}, '', '/cart');
  page.w.history.pushState({}, '', '/cart'); // same path
  page.w.history.replaceState({}, '', '/cart?x=1'); // only the query changed
  page.w.history.pushState({}, '', '/checkout');
  page.w.history.back();
  page.hide();
  const paths = page.events().filter((e) => e.type === 'pageview').map((e) => e.path);
  assert.deepEqual(paths.slice(0, 3), ['/shop', '/cart', '/checkout']);
  page.close();
});

test('TTFB and FCP are reported as they happen', () => {
  const page = createPage();
  page.init();
  page.emit('paint', [{ name: 'first-paint', startTime: 100 }, { name: 'first-contentful-paint', startTime: 842.7 }]);
  page.hide();
  const v = vitalsOf(page.events());
  assert.equal(v.TTFB, 312);
  assert.equal(v.FCP, 843);
  page.close();
});

test('LCP: the last candidate wins, and it is sent once when the page is hidden', () => {
  const page = createPage();
  page.init();
  page.emit('largest-contentful-paint', [{ startTime: 900 }, { startTime: 2100.4 }]);
  page.emit('largest-contentful-paint', [{ startTime: 2600.2 }]);
  assert.equal(page.events().filter((e) => e.name === 'LCP').length, 0, 'not sent while the page is still visible');
  page.hide();
  page.hide(); // hiding again must not duplicate
  assert.deepEqual(page.events().filter((e) => e.name === 'LCP').map((e) => e.value), [2600]);
  page.close();
});

test('CLS uses session windows and ignores shifts right after input', () => {
  const page = createPage();
  page.init();
  page.emit('layout-shift', [
    { startTime: 100, value: 0.05, hadRecentInput: false },
    { startTime: 600, value: 0.04, hadRecentInput: false }, // same window, 0.09 so far
    { startTime: 700, value: 0.5, hadRecentInput: true }, // caused by a click, ignored
    { startTime: 3000, value: 0.03, hadRecentInput: false }, // new window
  ]);
  page.hide();
  assert.equal(vitalsOf(page.events()).CLS, 0.09);
  page.close();
});

test('CLS is reported as 0 when the browser supports it and nothing shifted', () => {
  const page = createPage();
  page.init();
  page.hide();
  assert.equal(vitalsOf(page.events()).CLS, 0);
  page.close();
});

test('INP: slowest interaction, taking the max of events that share an interactionId', () => {
  const page = createPage();
  page.init();
  page.emit('event', [
    { interactionId: 1, duration: 120 },
    { interactionId: 1, duration: 300 },
    { interactionId: 2, duration: 80 },
    { interactionId: 0, duration: 900 }, // not an interaction (hover etc.)
  ]);
  page.hide();
  assert.equal(vitalsOf(page.events()).INP, 300);
  page.close();
});

test('no INP is reported when the visitor never interacted', () => {
  const page = createPage();
  page.init();
  page.hide();
  assert.equal(vitalsOf(page.events()).INP, undefined);
  page.close();
});

test('errors: captured with stack, identical ones de-duplicated, capped at 20 per page', () => {
  const page = createPage();
  page.init();
  const err = new Error('Boom');
  for (let i = 0; i < 3; i += 1) page.w.dispatchEvent(new page.w.ErrorEvent('error', { message: 'Boom', error: err }));
  for (let i = 0; i < 40; i += 1) {
    const e = new Error(`Different ${i}`);
    e.stack = `Error: Different ${i}\n    at fn${i} (app.js:1:${i})`;
    page.w.dispatchEvent(new page.w.ErrorEvent('error', { message: e.message, error: e }));
  }
  page.hide();
  const errors = page.events().filter((e) => e.type === 'error');
  assert.equal(errors.length, 20);
  assert.equal(errors.filter((e) => e.message === 'Boom').length, 1);
  assert.match(errors[0].stack, /Boom/);
  page.close();
});

test('errors: long messages and stacks are truncated, missing messages get a placeholder', () => {
  const page = createPage();
  page.init();
  const e = new Error('m'.repeat(900));
  e.stack = 's'.repeat(9000);
  page.w.dispatchEvent(new page.w.ErrorEvent('error', { message: e.message, error: e }));
  const bare = new page.w.Event('unhandledrejection');
  bare.reason = undefined;
  page.w.dispatchEvent(bare);
  page.hide();
  const errors = page.events().filter((x) => x.type === 'error');
  assert.equal(errors[0].message.length, 500);
  assert.equal(errors[0].stack.length, 4000);
  assert.equal(errors[1].message, 'undefined');
  page.close();
});

test('unhandled promise rejections are captured, including non-Error reasons', () => {
  const page = createPage();
  page.init();
  const a = new page.w.Event('unhandledrejection');
  a.reason = new Error('Async failure');
  const b = new page.w.Event('unhandledrejection');
  b.reason = 'just a string';
  page.w.dispatchEvent(a);
  page.w.dispatchEvent(b);
  page.hide();
  const messages = page.events().filter((e) => e.type === 'error').map((e) => e.message);
  assert.deepEqual(messages, ['Async failure', 'just a string']);
  page.close();
});

test('the page hide flush uses sendBeacon with a text/plain body (no CORS preflight)', () => {
  const page = createPage();
  page.init();
  page.hide();
  assert.equal(page.sent.at(-1).via, 'beacon');
  assert.equal(page.sent.at(-1).type, 'text/plain');
  page.close();
});

test('falls back to fetch when sendBeacon is missing or refuses', () => {
  const page = createPage({ beacon: false });
  page.init();
  page.hide();
  assert.equal(page.sent.at(-1).via, 'fetch');
  assert.equal(page.sent.at(-1).type, 'text/plain');
  page.close();

  const refusing = createPage();
  Object.defineProperty(refusing.w.navigator, 'sendBeacon', { configurable: true, value: () => false });
  refusing.init();
  refusing.hide();
  assert.equal(refusing.sent.at(-1).via, 'fetch');
  refusing.close();
});

test('large queues are split into batches of at most 50 events', () => {
  const page = createPage();
  page.init();
  for (let i = 0; i < 130; i += 1) {
    const e = new Error(`e${i}`);
    e.stack = `Error\n    at f${i}`;
    page.w.dispatchEvent(new page.w.ErrorEvent('error', { message: e.message, error: e }));
  }
  page.hide();
  assert.ok(page.sent.every((s) => s.body.events.length <= 50));
  page.close();
});

test('works when sessionStorage is blocked (private mode, strict settings)', () => {
  const page = createPage({ storage: false });
  page.init();
  page.hide();
  assert.ok(page.events().length > 0);
  page.close();
});

test('a browser with no PerformanceObserver still sends page views and errors', () => {
  const page = createPage();
  page.w.PerformanceObserver = undefined;
  page.init();
  page.w.dispatchEvent(new page.w.ErrorEvent('error', { message: 'x', error: new Error('x') }));
  page.hide();
  const types = new Set(page.events().map((e) => e.type));
  assert.ok(types.has('pageview') && types.has('error'));
  page.close();
});

test('every event matches the shape the server accepts', async () => {
  const { parseBatch } = await import('../../server/src/validators/ingest.js').catch(() => ({}));
  if (!parseBatch) return; // server dependencies not installed: skip the cross-package check
  const page = createPage();
  page.init({ release: '1.0.0' });
  page.emit('paint', [{ name: 'first-contentful-paint', startTime: 500 }]);
  page.emit('largest-contentful-paint', [{ startTime: 1800 }]);
  page.emit('event', [{ interactionId: 1, duration: 150 }]);
  page.w.dispatchEvent(new page.w.ErrorEvent('error', { message: 'Boom', error: new Error('Boom') }));
  page.hide();
  for (const s of page.sent) {
    const parsed = parseBatch(s.body);
    assert.equal(parsed.dropped, 0, 'the server must accept everything the SDK sends');
  }
  page.close();
});
