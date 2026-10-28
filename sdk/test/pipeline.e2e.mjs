/**
 * End-to-End Pipeline Verification
 * Simulates browser telemetry dispatch -> HTTP Ingestion Buffer -> Database -> API Aggregation
 */
import assert from 'node:assert/strict';
import { createPage } from './helpers.mjs';

const API = process.env.API_URL || 'http://localhost:4000';
const KEY = process.env.RUM_KEY || 'rum_demo_0123456789abcdef';
const release = `pipeline-${Date.now()}`;

// 1. Run the real SDK, but let its network calls go to the real server.
const page = createPage({ url: 'http://localhost:3000/pricing', beacon: false });
page.w.fetch = (url, opts) => fetch(url, { ...opts, headers: { ...opts.headers, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' } });
page.init({ key: KEY, endpoint: `${API}/api/ingest`, release });
page.emit('paint', [{ name: 'first-contentful-paint', startTime: 900 }]);
page.emit('largest-contentful-paint', [{ startTime: 6100 }]); // Poor LCP sample to verify P75 aggregation
page.emit('layout-shift', [{ startTime: 50, value: 0.31, hadRecentInput: false }]); // Poor CLS sample
page.emit('event', [{ interactionId: 1, duration: 240 }]);
const boom = new Error('Pipeline test error');
page.w.dispatchEvent(new page.w.ErrorEvent('error', { message: boom.message, error: boom }));
page.hide();
await new Promise((r) => setTimeout(r, 3500)); // the API flushes its buffer every 2 seconds
page.close();

// 2. Sign in as the demo developer and read what the dashboard would read.
let cookie = '';
const call = async (path, init = {}) => {
  const res = await fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });
  const set = res.headers.getSetCookie();
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  return res.json();
};
await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'demo@fieldwork.dev', password: 'Demo@12345' }) });
const { projects } = await call('/api/projects');
const site = projects.find((p) => p.key === KEY);
assert.ok(site, 'seeded demo project not found. Run npm run seed first.');

const breakdown = await call(`/api/projects/${site._id}/stats/breakdown?range=1h&metric=LCP&by=release`);
const mine = breakdown.rows.find((r) => r.label === release);
assert.ok(mine, 'the SDK release shows up in the dashboard data');
assert.equal(mine.p75, 6100);

const cls = await call(`/api/projects/${site._id}/stats/breakdown?range=1h&metric=CLS&by=release`);
assert.equal(cls.rows.find((r) => r.label === release).p75, 0.31);

const errors = await call(`/api/projects/${site._id}/stats/errors?range=1h`);
assert.ok(errors.errors.some((e) => e.message === 'Pipeline test error' && e.path === '/pricing'));

const vitals = await call(`/api/projects/${site._id}/stats/vitals?range=1h`);
assert.ok(vitals.vitals.find((v) => v.name === 'FCP').samples >= 1);
console.log('pipeline ok: SDK -> API -> database -> dashboard queries');
