// k6 load test for /api/ingest. Start the api with INGEST_RATE_PER_MIN=100000000 first,
// then: k6 run loadtest/ingest.js   (override with -e BASE_URL=... -e RUM_KEY=...)
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '20s', target: 50 },
    { duration: '40s', target: 200 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<200'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:4000';
const KEY = __ENV.RUM_KEY || 'rum_demo_0123456789abcdef'; // created by `npm run seed`

export default function () {
  const sessionId = `k6-${__VU}-${__ITER}`;
  const payload = JSON.stringify({
    key: KEY,
    release: 'loadtest',
    events: [
      { type: 'pageview', path: '/', sessionId },
      { type: 'vital', name: 'LCP', value: 1500 + Math.random() * 2500, path: '/', sessionId },
      { type: 'vital', name: 'CLS', value: Math.random() * 0.2, path: '/', sessionId },
    ],
  });
  const res = http.post(`${BASE}/api/ingest`, payload, { headers: { 'Content-Type': 'text/plain' } });
  check(res, { 'accepted (202)': (r) => r.status === 202 });
}
