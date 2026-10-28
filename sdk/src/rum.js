// Fieldwork browser SDK, no dependencies

const MAX_ERRORS_PER_PAGE = 20;
const MAX_BATCH = 50;

function getSession(sampleRate) {
  try {
    let v = sessionStorage.getItem('_rum');
    if (!v) {
      v = `${Math.random().toString(36).slice(2, 12)}|${Math.random() < sampleRate ? 1 : 0}`;
      sessionStorage.setItem('_rum', v);
    }
    const [id, on] = v.split('|');
    return on === '1' ? id : null; // null = this session is sampled out
  } catch {
    // Fallback when sessionStorage is restricted
    return Math.random() < sampleRate ? Math.random().toString(36).slice(2, 12) : null;
  }
}

export function init(opts = {}) {
  if (typeof window === 'undefined' || window.__rumStarted) return;
  const { key, endpoint, release, sampleRate = 1, flushInterval = 5000 } = opts;
  if (!key || !endpoint) return;
  window.__rumStarted = true;

  const sessionId = getSession(sampleRate);
  if (!sessionId) return;

  const queue = [];
  let path = location.pathname;

  function send(events, final) {
    const body = JSON.stringify({ key, release, events });
    // text/plain payload avoids CORS preflight OPTIONS request
    if (final && navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }))) return;
    fetch(endpoint, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, keepalive: true, mode: 'cors' }).catch(() => {});
  }
  function flush(final) {
    while (queue.length) send(queue.splice(0, MAX_BATCH), final);
  }
  function push(event) {
    queue.push({ ...event, path, sessionId, ts: Date.now() });
    if (queue.length >= 20) flush();
  }

  const view = () => {
    path = location.pathname;
    push({ type: 'pageview' });
  };
  view();
  ['pushState', 'replaceState'].forEach((method) => {
    const original = history[method];
    history[method] = function () {
      const before = location.pathname;
      const result = original.apply(this, arguments);
      if (location.pathname !== before) view();
      return result;
    };
  });
  addEventListener('popstate', () => location.pathname !== path && view());

  let errorCount = 0;
  const seen = new Set();
  function captureError(message, stack) {
    if (errorCount >= MAX_ERRORS_PER_PAGE) return;
    const text = String(message || 'Unknown error').slice(0, 500);
    const signature = text + String(stack || '').split('\n')[1];
    if (seen.has(signature)) return; // Deduplicate recurring exceptions
    seen.add(signature);
    errorCount += 1;
    push({ type: 'error', message: text, stack: stack ? String(stack).slice(0, 4000) : undefined });
  }
  addEventListener('error', (e) => {
    if (e.target && e.target !== window) return; // Ignore resource asset load failures
    captureError(e.message, e.error && e.error.stack);
  });
  addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    captureError((r && r.message) || String(r), r && r.stack);
  });

  const vitals = {};
  const interactions = new Map();

  function observe(type, callback, extra) {
    try {
      new PerformanceObserver((list) => callback(list.getEntries())).observe({ type, buffered: true, ...extra });
    } catch {
      // Entry type unsupported in runtime environment
    }
  }

  if (window.PerformanceObserver) {
    const supported = PerformanceObserver.supportedEntryTypes || [];

    observe('paint', (entries) =>
      entries.forEach((e) => e.name === 'first-contentful-paint' && push({ type: 'vital', name: 'FCP', value: Math.round(e.startTime) }))
    );
    observe('largest-contentful-paint', (entries) => {
      vitals.LCP = entries[entries.length - 1].startTime;
    });

    // Cumulative Layout Shift (CLS): maximum session window with 1s gap limit and 5s max duration
    if (supported.includes('layout-shift')) vitals.CLS = 0;
    let windowValue = 0;
    let windowStart = 0;
    let windowLast = 0;
    observe('layout-shift', (entries) =>
      entries.forEach((e) => {
        if (e.hadRecentInput) return;
        if (windowValue && e.startTime - windowLast < 1000 && e.startTime - windowStart < 5000) windowValue += e.value;
        else {
          windowValue = e.value;
          windowStart = e.startTime;
        }
        windowLast = e.startTime;
        if (windowValue > vitals.CLS) vitals.CLS = windowValue;
      })
    );

    // Interaction to Next Paint (INP)
    observe(
      'event',
      (entries) =>
        entries.forEach((e) => e.interactionId && interactions.set(e.interactionId, Math.max(interactions.get(e.interactionId) || 0, e.duration))),
      { durationThreshold: 40 }
    );
  }

  const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  if (nav && nav.responseStart > 0) push({ type: 'vital', name: 'TTFB', value: Math.round(nav.responseStart) });

  // Flush accumulated vitals on page visibility hidden
  let reported = false;
  function reportFinalVitals() {
    if (reported) return;
    reported = true;
    if (vitals.LCP != null) push({ type: 'vital', name: 'LCP', value: Math.round(vitals.LCP) });
    if (vitals.CLS != null) push({ type: 'vital', name: 'CLS', value: +vitals.CLS.toFixed(4) });
    if (interactions.size) {
      const sorted = [...interactions.values()].sort((a, b) => b - a);
      push({ type: 'vital', name: 'INP', value: Math.round(sorted[Math.min(Math.floor(sorted.length / 50), sorted.length - 1)]) });
    }
  }
  function onHide() {
    reportFinalVitals();
    flush(true);
  }
  addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && onHide(), true);
  addEventListener('pagehide', onHide);

  setInterval(() => flush(), flushInterval);

  return { captureError: (err) => captureError(err && err.message, err && err.stack) };
}
