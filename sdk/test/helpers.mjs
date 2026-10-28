import { JSDOM } from 'jsdom';
import { buildSync } from 'esbuild';

// Compile SDK bundle in-memory for testing within isolated JSDOM browser contexts
const bundle = buildSync({
  stdin: { contents: "import { init } from './src/rum.js'; window.__init = init;", resolveDir: process.cwd() },
  bundle: true,
  write: false,
  format: 'iife',
}).outputFiles[0].text;

class MockBlob {
  constructor(parts, opts = {}) {
    this.text = parts.join('');
    this.type = opts.type;
  }
}

// Factory for an isolated DOM environment with mock performance observers and transport interceptors
export function createPage({ url = 'http://localhost:3000/shop', beacon = true, storage = true } = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const sent = []; // Captured requests: { via, url, type, body }
  const observers = {};

  w.Blob = MockBlob;
  w.fetch = (u, opts) => {
    sent.push({ via: 'fetch', url: u, type: opts.headers['Content-Type'], body: JSON.parse(opts.body) });
    return Promise.resolve({});
  };
  if (beacon) {
    Object.defineProperty(w.navigator, 'sendBeacon', {
      configurable: true,
      value: (u, blob) => {
        sent.push({ via: 'beacon', url: u, type: blob.type, body: JSON.parse(blob.text) });
        return true;
      },
    });
  }
  w.PerformanceObserver = class {
    constructor(cb) {
      this.cb = cb;
    }
    observe({ type }) {
      observers[type] = this.cb;
    }
  };
  w.PerformanceObserver.supportedEntryTypes = ['paint', 'largest-contentful-paint', 'layout-shift', 'event'];
  w.performance.getEntriesByType = (t) => (t === 'navigation' ? [{ responseStart: 312.4 }] : []);
  if (!storage) {
    Object.defineProperty(w, 'sessionStorage', {
      get() {
        throw new Error('blocked');
      },
    });
  }
  w.eval(bundle);

  return {
    w,
    sent,
    init: (opts = {}) => w.__init({ key: 'rum_testkey123', endpoint: 'https://rum.test/api/ingest', ...opts }),
    emit: (type, entries) => observers[type]({ getEntries: () => entries }),
    hide() {
      Object.defineProperty(w.document, 'visibilityState', { configurable: true, value: 'hidden' });
      w.dispatchEvent(new w.Event('visibilitychange'));
    },
    events: () => sent.flatMap((s) => s.body.events),
    close: () => w.close(),
  };
}
