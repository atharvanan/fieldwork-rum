// API tests against a real mongo 7+. The database in MONGO_URI gets dropped, don't point it at real data.
//   MONGO_URI=mongodb://127.0.0.1:27017/fieldwork_test npm run test:e2e
import { before, after, test, describe } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fieldwork_test';
process.env.ADMIN_EMAIL = 'boss@example.com';
process.env.INGEST_RATE_PER_MIN = '60';
process.env.REGISTER_RATE_PER_HOUR = '1000';
process.env.CLIENT_ORIGIN = 'http://localhost:3000';

const { createApp } = await import('../../src/app.js');
const { Event } = await import('../../src/models/Event.js');
const { Alert } = await import('../../src/models/Alert.js');
const { Project } = await import('../../src/models/Project.js');
const { RefreshToken } = await import('../../src/models/RefreshToken.js');
const { User } = await import('../../src/models/User.js');
const buffer = await import('../../src/services/eventBuffer.js');
const { runAlertCheck } = await import('../../src/jobs/alerts.js');

let server;
let base;

// Test client session utility maintaining cookie jar state
function browser() {
  const jar = new Map();
  return {
    jar,
    async req(method, path, { body, headers = {}, raw } = {}) {
      const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await fetch(base + path, {
        method,
        headers: { ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: raw ?? (body ? JSON.stringify(body) : undefined),
      });
      for (const line of res.headers.getSetCookie()) {
        const [pair, ...attrs] = line.split('; ');
        const [name, ...rest] = pair.split('=');
        const value = rest.join('=');
        const expired = attrs.some((a) => /^expires=Thu, 01 Jan 1970/i.test(a)) || value === '';
        if (expired) jar.delete(name);
        else jar.set(name, value);
      }
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return { status: res.status, json, headers: res.headers, setCookies: res.headers.getSetCookie() };
    },
  };
}
function make() {
  const b = browser();
  b.get = (p, o) => b.req('GET', p, o);
  b.post = (p, body, o) => b.req('POST', p, { body, ...o });
  b.patch = (p, body) => b.req('PATCH', p, { body });
  b.del = (p) => b.req('DELETE', p);
  return b;
}

const ingestRaw = (body, headers = {}) =>
  fetch(`${base}/api/ingest`, { method: 'POST', headers: { 'Content-Type': 'text/plain', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const vital = (name, value, extra = {}) => ({ type: 'vital', name, value, path: '/', sessionId: 's1', ...extra });

async function signUp(email, name = 'Test User', password = 'Passw0rd!x') {
  const b = make();
  const r = await b.post('/api/auth/register', { name, email, password });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return b;
}
async function newSite(b, name = 'Site', domain) {
  const r = await b.post('/api/projects', { name, ...(domain ? { domain } : {}) });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.project;
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()));
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('health and basics', () => {
  test('health reports connected database', async () => {
    const r = await make().get('/api/health');
    assert.deepEqual(r.json, { status: 'ok', mongo: 'connected' });
  });
  test('unknown route is a JSON 404', async () => {
    const r = await make().get('/api/nope');
    assert.equal(r.status, 404);
    assert.equal(r.json.error, 'Not found');
  });
  test('security headers are present', async () => {
    const r = await make().get('/api/health');
    assert.ok(r.headers.get('x-content-type-options'));
    assert.equal(r.headers.get('x-powered-by'), null);
  });
});

describe('registration', () => {
  test('rejects bad input', async () => {
    const b = make();
    for (const body of [
      {},
      { name: '', email: 'a@b.co', password: 'longenough1' },
      { name: 'A', email: 'not-an-email', password: 'longenough1' },
      { name: 'A', email: 'a@b.co', password: 'short' },
      { name: 'A', email: 'a@b.co', password: 'x'.repeat(73) },
      { name: 'x'.repeat(81), email: 'a@b.co', password: 'longenough1' },
      { name: 'A', email: { $ne: null }, password: 'longenough1' },
    ]) {
      const r = await b.post('/api/auth/register', body);
      assert.equal(r.status, 400, JSON.stringify(body));
    }
  });

  test('creates the user, sets cookies with the right flags, never returns the hash', async () => {
    const b = make();
    const r = await b.post('/api/auth/register', { name: 'Dev One', email: 'Dev1@Example.com ', password: 'Passw0rd!x' });
    assert.equal(r.status, 201);
    assert.equal(r.json.user.email, 'dev1@example.com'); // trimmed and lower-cased
    assert.equal(r.json.user.role, 'developer');
    assert.ok(!JSON.stringify(r.json).includes('passwordHash'));
    const access = r.setCookies.find((c) => c.startsWith('rum_access='));
    const refresh = r.setCookies.find((c) => c.startsWith('rum_refresh='));
    const hint = r.setCookies.find((c) => c.startsWith('rum_session='));
    assert.match(access, /HttpOnly/i);
    assert.match(refresh, /HttpOnly/i);
    assert.match(refresh, /Path=\/api\/auth/);
    assert.match(access, /SameSite=Lax/i);
    assert.doesNotMatch(hint, /HttpOnly/i);
    const stored = await User.findOne({ email: 'dev1@example.com' }).select('+passwordHash');
    assert.match(stored.passwordHash, /^\$2[aby]\$12\$/); // bcrypt, cost 12
  });

  test('duplicate email is a 409, even with different casing', async () => {
    const r = await make().post('/api/auth/register', { name: 'Again', email: 'DEV1@example.com', password: 'Passw0rd!x' });
    assert.equal(r.status, 409);
  });

  test('two simultaneous registrations for one email: exactly one wins', async () => {
    const body = { name: 'Race', email: 'race@example.com', password: 'Passw0rd!x' };
    const results = await Promise.all([make().post('/api/auth/register', body), make().post('/api/auth/register', body)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(await User.countDocuments({ email: 'race@example.com' }), 1);
  });

  test('the configured admin email becomes an admin', async () => {
    const b = make();
    const r = await b.post('/api/auth/register', { name: 'Boss', email: 'boss@example.com', password: 'Passw0rd!x' });
    assert.equal(r.json.user.role, 'admin');
  });
});

describe('login, sessions and tokens', () => {
  test('wrong password and unknown email give the same answer', async () => {
    const a = await make().post('/api/auth/login', { email: 'dev1@example.com', password: 'wrong-password' });
    const u = await make().post('/api/auth/login', { email: 'nobody@example.com', password: 'wrong-password' });
    assert.equal(a.status, 401);
    assert.equal(u.status, 401);
    assert.equal(a.json.error, u.json.error);
  });

  test('operator injection in login is rejected, not executed', async () => {
    const r = await make().post('/api/auth/login', { email: { $gt: '' }, password: { $gt: '' } });
    assert.equal(r.status, 400);
  });

  test('login works, /me returns the user, and a Bearer token also works', async () => {
    const b = make();
    const r = await b.post('/api/auth/login', { email: 'DEV1@example.com', password: 'Passw0rd!x' });
    assert.equal(r.status, 200);
    const me = await b.get('/api/auth/me');
    assert.equal(me.json.user.email, 'dev1@example.com');
    const bearer = await make().get('/api/auth/me', { headers: { Authorization: `Bearer ${b.jar.get('rum_access')}` } });
    assert.equal(bearer.status, 200);
  });

  test('missing, garbage and tampered tokens are 401', async () => {
    assert.equal((await make().get('/api/auth/me')).status, 401);
    assert.equal((await make().get('/api/auth/me', { headers: { Authorization: 'Bearer nonsense' } })).status, 401);
    const b = await signUp('tamper@example.com');
    const t = b.jar.get('rum_access');
    const bad = t.slice(0, -3) + (t.endsWith('aaa') ? 'bbb' : 'aaa');
    assert.equal((await make().get('/api/auth/me', { headers: { Authorization: `Bearer ${bad}` } })).status, 401);
  });

  test('an access token signed with the wrong secret is rejected', async () => {
    const { default: jwt } = await import('jsonwebtoken');
    const u = await User.findOne({ email: 'dev1@example.com' });
    const forged = jwt.sign({ role: 'admin' }, 'some-other-secret', { subject: String(u._id), expiresIn: '5m' });
    assert.equal((await make().get('/api/admin/overview', { headers: { Authorization: `Bearer ${forged}` } })).status, 401);
  });

  test('an expired access token is rejected', async () => {
    const { default: jwt } = await import('jsonwebtoken');
    const { env } = await import('../../src/config/env.js');
    const u = await User.findOne({ email: 'dev1@example.com' });
    const old = jwt.sign({ role: 'developer' }, env.accessSecret, { subject: String(u._id), expiresIn: -10 });
    assert.equal((await make().get('/api/auth/me', { headers: { Authorization: `Bearer ${old}` } })).status, 401);
  });

  test('refresh rotates the token and stores only a hash', async () => {
    const b = await signUp('rotate@example.com');
    const before = b.jar.get('rum_refresh');
    const r = await b.post('/api/auth/refresh');
    assert.equal(r.status, 200);
    assert.notEqual(b.jar.get('rum_refresh'), before);
    const docs = await RefreshToken.find({ tokenHash: before });
    assert.equal(docs.length, 0, 'old token must be gone');
    assert.equal(await RefreshToken.countDocuments({ tokenHash: b.jar.get('rum_refresh') }), 0, 'raw token must never be stored');
  });

  test('reusing an old refresh token revokes every session for that user', async () => {
    const b = await signUp('reuse@example.com');
    const stolen = b.jar.get('rum_refresh');
    assert.equal((await b.post('/api/auth/refresh')).status, 200); // legit rotation
    const thief = make();
    thief.jar.set('rum_refresh', stolen);
    const r = await thief.post('/api/auth/refresh');
    assert.equal(r.status, 401);
    // the legitimate user's newest token is revoked too
    assert.equal((await b.post('/api/auth/refresh')).status, 401);
  });

  test('refresh without a cookie, or with garbage, is 401', async () => {
    assert.equal((await make().post('/api/auth/refresh')).status, 401);
    const b = make();
    b.jar.set('rum_refresh', 'garbage.token.value');
    assert.equal((await b.post('/api/auth/refresh')).status, 401);
  });

  test('an access token cannot be used as a refresh token', async () => {
    const b = await signUp('swap@example.com');
    const t = make();
    t.jar.set('rum_refresh', b.jar.get('rum_access'));
    assert.equal((await t.post('/api/auth/refresh')).status, 401);
  });

  test('logout removes the refresh token and clears cookies', async () => {
    const b = await signUp('logout@example.com');
    const refresh = b.jar.get('rum_refresh');
    const r = await b.post('/api/auth/logout');
    assert.equal(r.status, 204);
    assert.equal(b.jar.size, 0);
    const again = make();
    again.jar.set('rum_refresh', refresh);
    assert.equal((await again.post('/api/auth/refresh')).status, 401);
  });

  test('logout without a session is harmless', async () => {
    assert.equal((await make().post('/api/auth/logout')).status, 204);
  });
});

describe('projects, ownership and roles', () => {
  test('create, list, read, update', async () => {
    const b = await signUp('owner@example.com');
    const p = await newSite(b, '  My Shop  ', 'https://www.Example.com/some/path');
    assert.equal(p.name, 'My Shop');
    assert.equal(p.domain, 'example.com');
    assert.match(p.key, /^rum_[0-9a-f]{32}$/);
    assert.equal(p.errorThreshold, 20);
    assert.equal((await b.get('/api/projects')).json.projects.length, 1);
    assert.equal((await b.get(`/api/projects/${p._id}`)).json.project.name, 'My Shop');
    const u = await b.patch(`/api/projects/${p._id}`, { name: 'Renamed', errorThreshold: 5 });
    assert.equal(u.json.project.name, 'Renamed');
    assert.equal(u.json.project.errorThreshold, 5);
  });

  test('validation: empty name, bad threshold values', async () => {
    const b = await signUp('validator@example.com');
    assert.equal((await b.post('/api/projects', { name: '   ' })).status, 400);
    assert.equal((await b.post('/api/projects', { name: 'x'.repeat(61) })).status, 400);
    const p = await newSite(b);
    for (const bad of [-1, 1.5, 'ten', 100001, null]) {
      assert.equal((await b.patch(`/api/projects/${p._id}`, { errorThreshold: bad })).status, 400, String(bad));
    }
  });

  test('clearing the domain works', async () => {
    const b = await signUp('cleardomain@example.com');
    const p = await newSite(b, 'S', 'example.org');
    const r = await b.patch(`/api/projects/${p._id}`, { domain: '' });
    assert.equal(r.status, 200);
    assert.equal(r.json.project.domain, undefined);
  });

  test("one developer cannot see, change, delete or read stats of another's site", async () => {
    const alice = await signUp('alice@example.com');
    const bob = await signUp('bob@example.com');
    const p = await newSite(alice, 'Alice site');
    assert.equal((await bob.get('/api/projects')).json.projects.length, 0);
    for (const [method, path] of [
      ['GET', `/api/projects/${p._id}`],
      ['PATCH', `/api/projects/${p._id}`],
      ['DELETE', `/api/projects/${p._id}`],
      ['POST', `/api/projects/${p._id}/rotate-key`],
      ['GET', `/api/projects/${p._id}/alerts`],
      ['GET', `/api/projects/${p._id}/stats/vitals`],
      ['GET', `/api/projects/${p._id}/stats/errors`],
    ]) {
      const r = await bob.req(method, path, method === 'PATCH' ? { body: { name: 'hacked' } } : {});
      assert.equal(r.status, 404, `${method} ${path}`);
    }
    assert.equal((await alice.get(`/api/projects/${p._id}`)).json.project.name, 'Alice site');
  });

  test('malformed ids are a 404, not a 500', async () => {
    const b = await signUp('badid@example.com');
    for (const id of ['nope', '123', '%24ne', '0'.repeat(24)]) {
      assert.equal((await b.get(`/api/projects/${id}`)).status, 404, id);
    }
  });

  test('admins can open any site; developers cannot use admin routes', async () => {
    const dev = await signUp('plain@example.com');
    const p = await newSite(dev, 'Plain site');
    const admin = make();
    await admin.post('/api/auth/login', { email: 'boss@example.com', password: 'Passw0rd!x' });
    assert.equal((await admin.get(`/api/projects/${p._id}`)).status, 200);
    assert.ok((await admin.get('/api/projects')).json.projects.length >= 1);
    assert.equal((await dev.get('/api/admin/overview')).status, 403);
    assert.equal((await dev.get('/api/admin/users')).status, 403);
    assert.equal((await make().get('/api/admin/overview')).status, 401);
    const ov = await admin.get('/api/admin/overview');
    assert.equal(ov.status, 200);
    assert.ok(ov.json.users >= 1);
  });

  test('admin role changes: validation, self-protection, effect', async () => {
    const admin = make();
    await admin.post('/api/auth/login', { email: 'boss@example.com', password: 'Passw0rd!x' });
    const me = (await admin.get('/api/auth/me')).json.user;
    assert.equal((await admin.patch(`/api/admin/users/${me.id}/role`, { role: 'developer' })).status, 400);
    const target = await User.findOne({ email: 'plain@example.com' });
    assert.equal((await admin.patch(`/api/admin/users/${target._id}/role`, { role: 'superuser' })).status, 400);
    assert.equal((await admin.patch('/api/admin/users/xyz/role', { role: 'admin' })).status, 404);
    const ok = await admin.patch(`/api/admin/users/${target._id}/role`, { role: 'admin' });
    assert.equal(ok.json.user.role, 'admin');
    await User.updateOne({ _id: target._id }, { role: 'developer' });
  });

  test('deleting a site removes its events and alerts', async () => {
    const b = await signUp('deleter@example.com');
    const p = await newSite(b);
    await ingestRaw({ key: p.key, events: [vital('LCP', 1000)] });
    await buffer.flush();
    assert.equal(await Event.countDocuments({ project: p._id }), 1);
    await Alert.create({ project: p._id, count: 1, message: 'x' });
    assert.equal((await b.del(`/api/projects/${p._id}`)).status, 204);
    assert.equal(await Event.countDocuments({ project: p._id }), 0);
    assert.equal(await Alert.countDocuments({ project: p._id }), 0);
    assert.equal((await ingestRaw({ key: p.key, events: [vital('LCP', 1000)] })).status, 401, 'key must stop working');
  });
});

describe('ingest', () => {
  let p;
  before(async () => {
    p = await newSite(await signUp('ingester@example.com'), 'Ingest site');
  });

  test('accepts a mixed batch and stores it with server-side fields', async () => {
    const res = await ingestRaw(
      { key: p.key, release: '2.0.0', events: [vital('LCP', 3000, { rating: 'good' }), { type: 'pageview', path: '/a', sessionId: 's1' }, { type: 'error', message: 'Boom', stack: 'at x', path: '/a', sessionId: 's1' }] },
      { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' }
    );
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { accepted: 3, dropped: 0 });
    await buffer.flush();
    const lcp = await Event.findOne({ project: p._id, name: 'LCP' }).lean();
    assert.equal(lcp.rating, 'needs-improvement', 'client-sent rating must be ignored');
    assert.equal(lcp.release, '2.0.0');
    assert.deepEqual([lcp.browser, lcp.os, lcp.device], ['Safari', 'iOS', 'mobile']);
  });

  test('also accepts application/json', async () => {
    const res = await fetch(`${base}/api/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: p.key, events: [vital('FCP', 900)] }) });
    assert.equal(res.status, 202);
  });

  test('bad envelopes are 400', async () => {
    for (const body of ['{oops', '', 'null', '[]', JSON.stringify({ key: p.key }), JSON.stringify({ key: p.key, events: [] }), JSON.stringify({ key: p.key, events: 'x' }), JSON.stringify({ events: [vital('LCP', 1)] }), JSON.stringify({ key: 'x', events: [vital('LCP', 1)] }), JSON.stringify({ key: p.key, events: new Array(51).fill(vital('LCP', 1)) })]) {
      const res = await ingestRaw(body);
      assert.equal(res.status, 400, body.slice(0, 40));
    }
  });

  test('exactly 50 events is fine, 51 is not', async () => {
    assert.equal((await ingestRaw({ key: p.key, events: new Array(50).fill(vital('TTFB', 300)) })).status, 202);
    assert.equal((await ingestRaw({ key: p.key, events: new Array(51).fill(vital('TTFB', 300)) })).status, 400);
  });

  test('bad events are dropped but good ones in the same batch are kept', async () => {
    const events = [
      vital('LCP', 1200),
      vital('LCP', -5),
      vital('LCP', '1200'),
      vital('NOPE', 5),
      vital('LCP', 700000),
      { ...vital('LCP', 1), sessionId: 'x'.repeat(65) },
      { ...vital('LCP', 1), path: '' },
      { type: 'error', path: '/', sessionId: 's' },
      { type: 'error', message: 'm'.repeat(501), path: '/', sessionId: 's' },
      { type: 'wat' },
      null,
      42,
    ];
    const res = await ingestRaw({ key: p.key, events });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { accepted: 1, dropped: 11 });
  });

  test('unknown properties are stripped, not stored', async () => {
    await ingestRaw({ key: p.key, release: 'strip-test', events: [{ ...vital('CLS', 0.05), evil: 'x', $where: '1' }] });
    await buffer.flush();
    const e = await Event.findOne({ project: p._id, release: 'strip-test' }).lean();
    assert.equal(e.evil, undefined);
    assert.equal(e.$where, undefined);
  });

  test('unknown key is 401 and does not leak whether it ever existed', async () => {
    const res = await ingestRaw({ key: 'rum_' + 'f'.repeat(32), events: [vital('LCP', 1)] });
    assert.equal(res.status, 401);
  });

  test('oversize body is 413', async () => {
    const res = await ingestRaw({ key: p.key, events: [{ type: 'error', message: 'x', stack: 'y'.repeat(70000), path: '/', sessionId: 's' }] });
    assert.equal(res.status, 413);
  });

  test('timestamps outside a sane window are replaced with now', async () => {
    const now = Date.now();
    await ingestRaw({ key: p.key, release: 'ts-test', events: [vital('LCP', 1, { ts: now + 3600e3 }), vital('LCP', 2, { ts: now - 3 * 86400e3 }), vital('LCP', 3, { ts: now - 60e3 })] });
    await buffer.flush();
    const rows = await Event.find({ project: p._id, release: 'ts-test' }).sort({ value: 1 }).lean();
    assert.equal(rows.length, 3);
    assert.ok(Math.abs(rows[0].ts - now) < 10_000, 'future ts clamped');
    assert.ok(Math.abs(rows[1].ts - now) < 10_000, 'stale ts clamped');
    assert.ok(Math.abs(rows[2].ts - (now - 60e3)) < 1000, 'sane ts kept');
  });

  test('unicode, emoji and markup are stored verbatim (output is escaped by React, not here)', async () => {
    await ingestRaw({ key: p.key, release: 'uni', events: [{ type: 'error', message: '<script>alert(1)</script> 💥 ñ 日本語', path: '/日本', sessionId: 's' }] });
    await buffer.flush();
    const e = await Event.findOne({ project: p._id, release: 'uni' }).lean();
    assert.equal(e.message, '<script>alert(1)</script> 💥 ñ 日本語');
  });

  test('CORS: any origin may post; credentialed API does not trust random origins', async () => {
    const pre = await fetch(`${base}/api/ingest`, { method: 'OPTIONS', headers: { Origin: 'https://random.site', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), '*');
    const post = await ingestRaw({ key: p.key, events: [vital('LCP', 1000)] }, { Origin: 'https://random.site' });
    assert.equal(post.headers.get('access-control-allow-origin'), '*');
    const evil = await fetch(`${base}/api/projects`, { headers: { Origin: 'https://evil.site' } });
    assert.notEqual(evil.headers.get('access-control-allow-origin'), 'https://evil.site');
    const good = await fetch(`${base}/api/projects`, { headers: { Origin: 'http://localhost:3000' } });
    assert.equal(good.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.equal(good.headers.get('access-control-allow-credentials'), 'true');
  });

  test('domain pinning accepts the domain and subdomains, rejects look-alikes', async () => {
    const b = await signUp('pin@example.com');
    const pinned = await newSite(b, 'Pinned', 'example.com');
    const send = (origin) => ingestRaw({ key: pinned.key, events: [vital('LCP', 1000)] }, origin ? { Origin: origin } : {});
    assert.equal((await send('https://example.com')).status, 202);
    assert.equal((await send('https://shop.example.com')).status, 202);
    assert.equal((await send('http://localhost:3000')).status, 403);
    assert.equal((await send('https://evil-example.com')).status, 403);
    assert.equal((await send('https://example.com.evil.io')).status, 403);
    assert.equal((await send('not a url')).status, 403);
    assert.equal((await send(null)).status, 202, 'no Origin header (server-to-server) is allowed');
  });

  test('changing the domain takes effect immediately despite the key cache', async () => {
    const b = await signUp('pin2@example.com');
    const site = await newSite(b, 'Pin2');
    const send = () => ingestRaw({ key: site.key, events: [vital('LCP', 1000)] }, { Origin: 'https://other.dev' });
    assert.equal((await send()).status, 202);
    await b.patch(`/api/projects/${site._id}`, { domain: 'example.com' });
    assert.equal((await send()).status, 403);
  });

  test('rotating the key kills the old key and enables the new one', async () => {
    const b = await signUp('rotatekey@example.com');
    const site = await newSite(b, 'Rotating');
    assert.equal((await ingestRaw({ key: site.key, events: [vital('LCP', 1000)] })).status, 202);
    const r = await b.post(`/api/projects/${site._id}/rotate-key`);
    assert.notEqual(r.json.project.key, site.key);
    assert.equal((await ingestRaw({ key: site.key, events: [vital('LCP', 1000)] })).status, 401);
    assert.equal((await ingestRaw({ key: r.json.project.key, events: [vital('LCP', 1000)] })).status, 202);
  });

  test('per-key rate limit returns 429 after the limit, other keys are unaffected', async () => {
    const b = await signUp('limited@example.com');
    const a = await newSite(b, 'Limited');
    const other = await newSite(b, 'Other');
    const codes = [];
    for (let i = 0; i < 65; i += 1) codes.push((await ingestRaw({ key: a.key, events: [vital('LCP', 1000)] })).status);
    assert.equal(codes.filter((c) => c === 202).length, 60);
    assert.equal(codes.filter((c) => c === 429).length, 5);
    assert.equal((await ingestRaw({ key: other.key, events: [vital('LCP', 1000)] })).status, 202);
  });

  test('the buffer sheds load instead of growing without bound', () => {
    const before = buffer.bufferStats();
    assert.equal(buffer.enqueue(new Array(20001).fill({})), false);
    assert.equal(buffer.bufferStats().queued, before.queued);
    assert.equal(buffer.bufferStats().dropped, before.dropped + 20001);
  });

  test('stopBuffer drains whatever is still queued (graceful shutdown)', async () => {
    const b = await signUp('drain@example.com');
    const site = await newSite(b, 'Drain');
    await ingestRaw({ key: site.key, events: [vital('LCP', 1111)] });
    await buffer.stopBuffer();
    assert.equal(await Event.countDocuments({ project: site._id }), 1);
  });
});

describe('stats queries', () => {
  let b;
  let site;
  before(async () => {
    b = await signUp('stats@example.com');
    site = await newSite(b, 'Stats');
    const lcp = [1000, 2000, 3000, 4000, 5000, 1500, 2500, 3500, 4500, 500];
    const events = [];
    lcp.forEach((v, i) => events.push(vital('LCP', v, { sessionId: `v${i}`, path: i % 2 ? '/cart' : '/' })));
    await ingestRaw({ key: site.key, release: '1.0.0', events: events.slice(0, 5) });
    await ingestRaw({ key: site.key, release: '1.1.0', events: events.slice(5) });
    await ingestRaw({ key: site.key, events: [{ type: 'pageview', path: '/', sessionId: 'v0' }, { type: 'pageview', path: '/cart', sessionId: 'v1' }, { type: 'pageview', path: '/', sessionId: 'v0' }] });
    await ingestRaw({ key: site.key, events: [1, 2, 3].map(() => ({ type: 'error', message: 'TypeError: x is undefined', stack: 'at f', path: '/', sessionId: 'v0' })).concat([{ type: 'error', message: 'TypeError: x is undefined', stack: 'at f', path: '/', sessionId: 'v9' }, { type: 'error', message: 'Other', path: '/cart', sessionId: 'v1' }]) });
    await buffer.flush();
    // old events that must fall outside the 24h range but inside 7d
    await Event.create({ project: site._id, type: 'vital', name: 'LCP', value: 9999, rating: 'poor', path: '/', sessionId: 'old', release: 'ancient', browser: 'Other', os: 'Other', device: 'desktop', ts: new Date(Date.now() - 3 * 86400e3) });
  });

  const url = (kind, qs = '') => `/api/projects/${site._id}/stats/${kind}${qs}`;

  test('overview counts events, pages and distinct visitors', async () => {
    const r = await b.get(url('overview', '?range=24h'));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { pageviews: 3, errors: 5, vitalSamples: 10, sessions: 10 });
  });

  test('time range filter excludes old events', async () => {
    const day = (await b.get(url('vitals', '?range=24h'))).json.vitals.find((v) => v.name === 'LCP');
    const week = (await b.get(url('vitals', '?range=7d'))).json.vitals.find((v) => v.name === 'LCP');
    assert.equal(day.samples, 10);
    assert.equal(week.samples, 11);
  });

  test('vitals returns percentiles, distribution and all five metrics', async () => {
    const r = await b.get(url('vitals', '?range=24h'));
    assert.deepEqual(r.json.vitals.map((v) => v.name), ['LCP', 'FCP', 'CLS', 'INP', 'TTFB']);
    const lcp = r.json.vitals.find((v) => v.name === 'LCP');
    assert.ok(lcp.p50 >= 2000 && lcp.p50 <= 3000, `p50 ${lcp.p50}`);
    assert.ok(lcp.p75 >= 3000 && lcp.p75 <= 4000, `p75 ${lcp.p75}`);
    assert.ok(lcp.p95 >= 4500, `p95 ${lcp.p95}`);
    assert.deepEqual(lcp.distribution, { good: 5, needsImprovement: 3, poor: 2 }); // <=2500 | <=4000 | above
    const empty = r.json.vitals.find((v) => v.name === 'INP');
    assert.deepEqual(empty, { name: 'INP', samples: 0, p50: null, p75: null, p95: null, distribution: { good: 0, needsImprovement: 0, poor: 0 } });
  });

  test('timeseries is sorted and sums to the sample count', async () => {
    const r = await b.get(url('timeseries', '?range=24h&metric=LCP'));
    assert.equal(r.status, 200);
    const times = r.json.points.map((p) => new Date(p.t).getTime());
    assert.deepEqual(times, [...times].sort((x, y) => x - y));
    assert.equal(r.json.points.reduce((n, p) => n + p.samples, 0), 10);
  });

  test('breakdown by release separates versions', async () => {
    const r = await b.get(url('breakdown', '?range=24h&metric=LCP&by=release'));
    const labels = Object.fromEntries(r.json.rows.map((x) => [x.label, x]));
    assert.ok(labels['1.0.0'] && labels['1.1.0']);
    assert.equal(labels['1.0.0'].samples, 5);
    assert.ok(!labels.ancient, 'old release is outside the range');
  });

  test('breakdown handles every grouping and missing values', async () => {
    for (const by of ['browser', 'os', 'device', 'path', 'release']) {
      const r = await b.get(url('breakdown', `?range=7d&metric=LCP&by=${by}`));
      assert.equal(r.status, 200, by);
      assert.ok(r.json.rows.length > 0);
    }
  });

  test('errors are grouped by message with counts, distinct visitors and a stack', async () => {
    const r = await b.get(url('errors', '?range=24h'));
    assert.equal(r.json.errors.length, 2);
    const top = r.json.errors[0];
    assert.equal(top.message, 'TypeError: x is undefined');
    assert.equal(top.count, 4);
    assert.equal(top.sessions, 2);
    assert.equal(top.stack, 'at f');
    assert.equal(r.json.series.reduce((n, p) => n + p.count, 0), 5);
  });

  test('a brand-new site returns empty results, not errors', async () => {
    const fresh = await newSite(b, 'Fresh');
    for (const kind of ['overview', 'vitals', 'timeseries', 'breakdown', 'errors']) {
      const r = await b.get(`/api/projects/${fresh._id}/stats/${kind}`);
      assert.equal(r.status, 200, kind);
    }
    assert.deepEqual((await b.get(`/api/projects/${fresh._id}/stats/errors`)).json, { errors: [], series: [] });
    assert.equal((await b.get(`/api/projects/${fresh._id}/stats/overview`)).json.sessions, 0);
  });

  test('invalid query parameters are 400s', async () => {
    for (const qs of ['?range=1y', '?metric=FOO', '?by=password', '?range[$ne]=x', '?range=24h&metric=LCP&by=']) {
      const kind = qs.includes('by=') ? 'breakdown' : qs.includes('metric') ? 'timeseries' : 'vitals';
      assert.equal((await b.get(url(kind, qs))).status, 400, qs);
    }
  });
});

describe('alerts job', () => {
  test('raises one alert per quiet period, respects the threshold, and 0 disables it', async () => {
    const b = await signUp('alerts@example.com');
    const site = await newSite(b, 'Alerty');
    const off = await newSite(b, 'Quiet');
    await b.patch(`/api/projects/${off._id}`, { errorThreshold: 0 });
    const mk = (id) => Array.from({ length: 25 }, (_, i) => ({ project: id, type: 'error', message: `e${i % 3}`, path: '/', sessionId: `s${i}`, ts: new Date(), browser: 'Chrome', os: 'Windows', device: 'desktop' }));
    await Event.insertMany([...mk(site._id), ...mk(off._id)]);
    await runAlertCheck();
    await runAlertCheck(); // second run inside the quiet period must not duplicate
    assert.equal(await Alert.countDocuments({ project: site._id }), 1);
    assert.equal(await Alert.countDocuments({ project: off._id }), 0);
    const r = await b.get(`/api/projects/${site._id}/alerts`);
    assert.equal(r.json.alerts.length, 1);
    assert.match(r.json.alerts[0].message, /25 errors/);
  });

  test('below the threshold raises nothing', async () => {
    const b = await signUp('belowthr@example.com');
    const site = await newSite(b, 'Calm');
    await Event.insertMany(Array.from({ length: 5 }, (_, i) => ({ project: site._id, type: 'error', message: 'e', path: '/', sessionId: `s${i}`, ts: new Date() })));
    await runAlertCheck();
    assert.equal(await Alert.countDocuments({ project: site._id }), 0);
  });
});

describe('database indexes', () => {
  test('TTL indexes exist where data must expire', async () => {
    const ev = await Event.collection.indexes();
    assert.ok(ev.some((i) => i.key.ts === 1 && i.expireAfterSeconds === 30 * 86400), 'events TTL');
    const rt = await RefreshToken.collection.indexes();
    assert.ok(rt.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0), 'refresh token TTL');
    const al = await Alert.collection.indexes();
    assert.ok(al.some((i) => i.key.createdAt === 1 && i.expireAfterSeconds), 'alert TTL');
  });
  test('stats queries use the compound index (no collection scan)', async () => {
    const proj = await Project.findOne({ name: 'Stats' });
    const plan = await Event.find({ project: proj._id, type: 'vital', name: 'LCP', ts: { $gte: new Date(Date.now() - 86400e3) } }).explain('queryPlanner');
    assert.match(JSON.stringify(plan.queryPlanner.winningPlan), /IXSCAN/);
  });
});

describe('more edge cases', () => {
  test('two refreshes with the same token at once: at most one succeeds', async () => {
    const b = await signUp('parallel@example.com');
    const token = b.jar.get('rum_refresh');
    const a = make();
    const c = make();
    a.jar.set('rum_refresh', token);
    c.jar.set('rum_refresh', token);
    const [r1, r2] = await Promise.all([a.post('/api/auth/refresh'), c.post('/api/auth/refresh')]);
    const ok = [r1, r2].filter((r) => r.status === 200).length;
    assert.ok(ok <= 1, 'a rotated token must never be accepted twice');
  });

  test('malformed JSON and oversize bodies on the dashboard API', async () => {
    const b = make();
    assert.equal((await b.req('POST', '/api/auth/login', { raw: '{bad', headers: { 'Content-Type': 'application/json' } })).status, 400);
    const big = JSON.stringify({ name: 'x'.repeat(200_000), email: 'a@b.co', password: 'longenough1' });
    assert.equal((await b.req('POST', '/api/auth/register', { raw: big, headers: { 'Content-Type': 'application/json' } })).status, 413);
  });

  test('ingest with no body and with the wrong content type is a clean 400', async () => {
    assert.equal((await fetch(`${base}/api/ingest`, { method: 'POST' })).status, 400);
    assert.equal((await fetch(`${base}/api/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=1' })).status, 400);
  });

  test('GET on the ingest endpoint is not allowed', async () => {
    assert.equal((await fetch(`${base}/api/ingest`)).status, 404);
  });

  test('a duplicate stack-less error and an error with only a message both group fine', async () => {
    const b = await signUp('nostack@example.com');
    const site = await newSite(b, 'NoStack');
    await ingestRaw({ key: site.key, events: [{ type: 'error', message: 'Script error.', path: '/', sessionId: 'a' }, { type: 'error', message: 'Script error.', path: '/', sessionId: 'b' }] });
    await buffer.flush();
    const r = await b.get(`/api/projects/${site._id}/stats/errors?range=1h`);
    assert.equal(r.json.errors[0].count, 2);
    assert.ok(!r.json.errors[0].stack, 'no stack stored, dashboard shows a fallback');
  });

  test('stats on a deleted site is 404', async () => {
    const b = await signUp('gone@example.com');
    const site = await newSite(b, 'Gone');
    await b.del(`/api/projects/${site._id}`);
    assert.equal((await b.get(`/api/projects/${site._id}/stats/vitals`)).status, 404);
  });
});

describe('brute force protection (runs last)', () => {
  test('repeated login attempts are rate limited', async () => {
    const b = make();
    let limited = false;
    for (let i = 0; i < 60 && !limited; i += 1) {
      const r = await b.post('/api/auth/login', { email: 'dev1@example.com', password: 'wrong-wrong' });
      limited = r.status === 429;
    }
    assert.ok(limited, 'expected a 429 within 60 attempts');
  });
});
