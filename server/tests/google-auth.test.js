import test from 'node:test';
import assert from 'node:assert/strict';
import { googleAuth, googleCallback } from '../src/controllers/auth.controller.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

test('Google Auth - redirects to login with error when client ID is missing', () => {
  const originalId = env.googleClientId;
  env.googleClientId = '';

  let redirectedUrl = '';
  const res = {
    redirect: (url) => {
      redirectedUrl = url;
    },
  };

  googleAuth({}, res);
  assert.match(redirectedUrl, /\/login\?error=Google\+OAuth\+not\+configured/);

  env.googleClientId = originalId;
});

test('Google Auth - generates CSRF state and redirects to Google Accounts when configured', () => {
  const originalId = env.googleClientId;
  const originalSecret = env.googleClientSecret;
  env.googleClientId = 'mock-google-client-id';
  env.googleClientSecret = 'mock-google-client-secret';

  let cookiesSet = {};
  let redirectedUrl = '';

  const res = {
    cookie: (name, val, opts) => {
      cookiesSet[name] = { val, opts };
    },
    redirect: (url) => {
      redirectedUrl = url;
    },
  };

  googleAuth({}, res);

  assert.ok(cookiesSet.rum_oauth_state, 'rum_oauth_state cookie should be set');
  assert.equal(cookiesSet.rum_oauth_state.opts.httpOnly, true);
  assert.match(redirectedUrl, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  assert.match(redirectedUrl, /client_id=mock-google-client-id/);
  assert.match(redirectedUrl, /scope=openid\+email\+profile/);

  env.googleClientId = originalId;
  env.googleClientSecret = originalSecret;
});

test('Google Auth Callback - rejects invalid or mismatched CSRF state', async () => {
  let redirectedUrl = '';
  let cookiesCleared = [];

  const req = {
    query: { code: 'sample_code', state: 'bad_state' },
    cookies: { rum_oauth_state: 'correct_state' },
  };

  const res = {
    clearCookie: (name) => {
      cookiesCleared.push(name);
    },
    redirect: (url) => {
      redirectedUrl = url;
    },
  };

  await googleCallback(req, res);

  assert.ok(cookiesCleared.includes('rum_oauth_state'));
  assert.match(redirectedUrl, /\/login\?error=/);
  assert.match(redirectedUrl, /Invalid(\+|%20)OAuth(\+|%20)state/i);
});

test('User Model - validates creation with googleId without passwordHash', () => {
  const user = new User({
    name: 'Google User',
    email: 'googleuser@example.com',
    googleId: 'google_oauth_sub_12345',
    avatarUrl: 'https://lh3.googleusercontent.com/photo.jpg',
  });

  const err = user.validateSync();
  assert.equal(err, undefined, 'User with googleId and no passwordHash should validate');
  assert.equal(user.role, 'developer');
});

