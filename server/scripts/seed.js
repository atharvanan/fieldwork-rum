/**
 * Database Seeder
 * Populates sample development accounts, telemetry event distributions, and baseline alerts.
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Project } from '../src/models/Project.js';
import { Event } from '../src/models/Event.js';
import { Alert } from '../src/models/Alert.js';
import { rateVital } from '../src/utils/rating.js';

const DEMO_KEY = 'rum_demo_0123456789abcdef';


await connectDb();

async function upsertUser(name, email, password, role) {
  const passwordHash = await bcrypt.hash(password, 12);
  return User.findOneAndUpdate({ email }, { name, email, passwordHash, role }, { upsert: true, new: true });
}
const dev = await upsertUser('Demo Developer', 'demo@fieldwork.dev', 'Demo@12345', 'developer');
await upsertUser('Demo Admin', 'admin@fieldwork.dev', 'Admin@12345', 'admin');

const project = await Project.findOneAndUpdate(
  { key: DEMO_KEY },
  { owner: dev._id, name: 'Demo Store', domain: undefined, key: DEMO_KEY, errorThreshold: 20 },
  { upsert: true, new: true }
);
await Event.deleteMany({ project: project._id });
await Alert.deleteMany({ project: project._id });

const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const lognormal = (median, sigma) => Math.exp(Math.log(median) + sigma * gauss());
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const agents = [
  ...Array(5).fill({ browser: 'Chrome', os: 'Windows', device: 'desktop' }),
  ...Array(3).fill({ browser: 'Chrome', os: 'Android', device: 'mobile' }),
  ...Array(3).fill({ browser: 'Safari', os: 'iOS', device: 'mobile' }),
  ...Array(2).fill({ browser: 'Safari', os: 'macOS', device: 'desktop' }),
  { browser: 'Firefox', os: 'Windows', device: 'desktop' },
  { browser: 'Edge', os: 'Windows', device: 'desktop' },
];
const paths = ['/', '/', '/products', '/products/42', '/cart', '/checkout'];
const errorMessages = [
  "TypeError: Cannot read properties of undefined (reading 'price')",
  'ChunkLoadError: Loading chunk 42 failed',
  'ReferenceError: gtag is not defined',
  'Error: Network request failed',
];

const now = Date.now();
const DAY = 86400e3;
const REGRESSION_AT = now - 3 * DAY; // Simulate release-over-release performance delta (v1.5.0 vs v1.4.0)
const events = [];

for (let i = 0; i < 700; i += 1) {
  const ts = now - Math.random() * 7 * DAY;
  const release = ts < REGRESSION_AT ? '1.4.0' : '1.5.0';
  const ua = pick(agents);
  const sessionId = `seed${i}`;
  const slow = ua.device === 'mobile' ? 1.45 : 1;
  const path = pick(paths);
  const base = { project: project._id, sessionId, release, ...ua };

  events.push({ ...base, type: 'pageview', path, ts: new Date(ts) });
  if (Math.random() < 0.4) events.push({ ...base, type: 'pageview', path: pick(paths), ts: new Date(ts + 20000) });

  const vitals = {
    TTFB: lognormal(520, 0.6) * slow,
    FCP: lognormal(1350, 0.4) * slow,
    LCP: lognormal(2050, 0.42) * slow * (release === '1.5.0' ? 1.4 : 1),
    CLS: Math.min(lognormal(0.05, 1.0), 1.5),
    INP: lognormal(170, 0.55) * (ua.device === 'mobile' ? 1.3 : 1),
  };
  for (const [name, value] of Object.entries(vitals)) {
    const v = name === 'CLS' ? +value.toFixed(3) : Math.round(value);
    events.push({ ...base, type: 'vital', name, value: v, rating: rateVital(name, v), path, ts: new Date(ts + 500) });
  }
  if (Math.random() < 0.12) {
    const message = pick(errorMessages);
    events.push({
      ...base,
      type: 'error',
      message,
      path,
      stack: `${message}\n    at renderCart (https://shop.example/assets/app.js:1:20431)\n    at onClick (https://shop.example/assets/app.js:1:9921)`,
      ts: new Date(ts + 3000),
    });
  }
}

for (let i = 0; i < events.length; i += 1000) await Event.insertMany(events.slice(i, i + 1000), { ordered: false });
await Alert.create({
  project: project._id,
  count: 27,
  message: '27 errors in the last 5 minutes (limit is 20).',
  createdAt: new Date(now - 2 * 3600e3),
});

console.log(`Seeded ${events.length} events.\n`);
console.log('Developer login: demo@fieldwork.dev / Demo@12345');
console.log('Admin login:     admin@fieldwork.dev / Admin@12345');
console.log(`Project key:     ${DEMO_KEY}`);
await mongoose.disconnect();
