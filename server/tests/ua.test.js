import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUA } from '../src/utils/ua.js';

const cases = [
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    { browser: 'Chrome', os: 'Windows', device: 'desktop' },
  ],
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
    { browser: 'Edge', os: 'Windows', device: 'desktop' },
  ],
  [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    { browser: 'Safari', os: 'iOS', device: 'mobile' },
  ],
  [
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    { browser: 'Chrome', os: 'Android', device: 'mobile' },
  ],
  [
    'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
    { browser: 'Firefox', os: 'Linux', device: 'desktop' },
  ],
];

for (const [ua, expected] of cases) {
  test(`parses ${expected.browser} on ${expected.os}`, () => assert.deepEqual(parseUA(ua), expected));
}
