import { env } from '../config/env.js';
import { ACCESS_TTL_MS, REFRESH_TTL_MS } from './tokens.js';

const secure = env.isProd;

export function setAuthCookies(res, access, refresh) {
  const base = { httpOnly: true, sameSite: 'lax', secure };
  res.cookie('rum_access', access, { ...base, path: '/', maxAge: ACCESS_TTL_MS });
  // refresh cookie is only sent to /api/auth
  res.cookie('rum_refresh', refresh, { ...base, path: '/api/auth', maxAge: REFRESH_TTL_MS });
  // readable by the next middleware, only used for redirects
  res.cookie('rum_session', '1', { httpOnly: false, sameSite: 'lax', secure, path: '/', maxAge: REFRESH_TTL_MS });
}

export function clearAuthCookies(res) {
  res.clearCookie('rum_access', { path: '/' });
  res.clearCookie('rum_refresh', { path: '/api/auth' });
  res.clearCookie('rum_session', { path: '/' });
}
