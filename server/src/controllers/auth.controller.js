import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { Project } from '../models/Project.js';
import { Event } from '../models/Event.js';
import { Alert } from '../models/Alert.js';
import { Audit } from '../models/Audit.js';
import { invalidateKey } from '../services/projectCache.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signAccess, signRefresh, sha256, REFRESH_TTL_MS } from '../utils/tokens.js';
import { setAuthCookies, clearAuthCookies } from '../utils/cookies.js';

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Use at least 8 characters').max(72),
});
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(72) });

// Constant-time dummy comparison to mitigate account enumeration via timing attacks
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const publicUser = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  avatarUrl: u.avatarUrl,
});

async function startSession(res, user) {
  const access = signAccess(user);
  const refresh = signRefresh(user);
  await RefreshToken.create({
    user: user._id,
    tokenHash: sha256(refresh),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  setAuthCookies(res, access, refresh);
}

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = registerSchema.parse(req.body);
  if (await User.exists({ email })) throw new AppError(409, 'An account with this email already exists');
  const user = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: env.adminEmail && email === env.adminEmail ? 'admin' : 'developer',
  });
  await startSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await User.findOne({ email }).select('+passwordHash');

  // Handle users who registered via Google OAuth and have no local password
  if (user && !user.passwordHash) {
    throw new AppError(
      400,
      'This account was created with Google. Please click "Continue with Google" to sign in.'
    );
  }

  const hash = user?.passwordHash || DUMMY_HASH;
  const ok = await bcrypt.compare(password, hash);
  if (!user || !ok) throw new AppError(401, 'Email or password is incorrect');

  await startSession(res, user);
  res.json({ user: publicUser(user) });
});

// Token rotation with automatic family invalidation on detected reuse
export const refresh = asyncHandler(async (req, res) => {
  const fail = (msg) => {
    clearAuthCookies(res);
    throw new AppError(401, msg);
  };
  const token = req.cookies?.rum_refresh;
  if (!token) fail('Sign in to continue');
  let payload;
  try {
    payload = jwt.verify(token, env.refreshSecret);
  } catch {
    fail('Sign in to continue');
  }
  const stored = await RefreshToken.findOneAndDelete({ tokenHash: sha256(token) });
  if (!stored) {
    await RefreshToken.deleteMany({ user: payload.sub });
    fail('Session ended for your security. Sign in again.');
  }
  const user = await User.findById(payload.sub);
  if (!user) fail('Sign in to continue');
  await startSession(res, user);
  res.json({ user: publicUser(user) });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.rum_refresh;
  if (token) await RefreshToken.deleteOne({ tokenHash: sha256(token) });
  clearAuthCookies(res);
  res.status(204).end();
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError(401, 'Sign in to continue');
  res.json({ user: publicUser(user) });
});

function generateOAuthState() {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = Date.now().toString();
  const payload = `${nonce}.${ts}`;
  const sig = crypto.createHmac('sha256', env.accessSecret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyOAuthState(stateStr) {
  if (!stateStr || typeof stateStr !== 'string') return false;
  const parts = stateStr.split('.');
  if (parts.length !== 3) return false;
  const [nonce, tsStr, sig] = parts;
  const ts = Number(tsStr);
  if (isNaN(ts) || Date.now() - ts > 15 * 60 * 1000 || ts > Date.now() + 60 * 1000) return false;
  const expectedSig = crypto.createHmac('sha256', env.accessSecret).update(`${nonce}.${tsStr}`).digest('hex');
  return sig === expectedSig;
}

/**
 * Initiates the Google OAuth 2.0 authorization code flow.
 */
export const googleAuth = (req, res) => {
  if (!env.googleClientId || !env.googleClientSecret) {
    return res.redirect(`${env.clientOrigin}/login?error=Google+OAuth+not+configured`);
  }

  const state = generateOAuthState();
  const secureCookie = env.isProd && env.clientOrigin.startsWith('https://');

  res.cookie('rum_oauth_state', state, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleCallbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
};

/**
 * Google OAuth 2.0 callback handler.
 * Exchanges authorization code for tokens, retrieves user profile, links or provisions
 * user record, establishes session cookies, and redirects to dashboard.
 */
export const googleCallback = asyncHandler(async (req, res) => {
  try {
    const { code, state, error } = req.query;
    const storedState = req.cookies?.rum_oauth_state;
    const secureCookie = env.isProd && env.clientOrigin.startsWith('https://');

    res.clearCookie('rum_oauth_state', { httpOnly: true, secure: secureCookie, sameSite: 'lax', path: '/' });

    if (error || !code) {
      return res.redirect(`${env.clientOrigin}/login?error=${encodeURIComponent(error || 'Authentication cancelled')}`);
    }

    // Validate state against HMAC signature or stored state cookie to defend against CSRF
    const isValidState = verifyOAuthState(state) || (state && storedState && state === storedState);
    if (!isValidState) {
      return res.redirect(`${env.clientOrigin}/login?error=${encodeURIComponent('Invalid OAuth state. Please try again.')}`);
    }

    // Exchange authorization code for access and ID tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: env.googleCallbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error('[auth] Google token exchange failed:', errorBody);
      let desc = 'Failed to exchange Google token';
      try {
        const parsed = JSON.parse(errorBody);
        desc = parsed.error_description || parsed.error || desc;
      } catch {}
      return res.redirect(`${env.clientOrigin}/login?error=${encodeURIComponent(desc)}`);
    }

    const tokenData = await tokenResponse.json();
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileResponse.ok) {
      const errorBody = await profileResponse.text();
      console.error('[auth] Google profile retrieval failed:', errorBody);
      return res.redirect(`${env.clientOrigin}/login?error=${encodeURIComponent('Failed to retrieve Google profile')}`);
    }

    const profile = await profileResponse.json();
    if (!profile.email) {
      return res.redirect(`${env.clientOrigin}/login?error=${encodeURIComponent('Google account has no associated email')}`);
    }

    const email = profile.email.toLowerCase().trim();
    const sub = profile.sub ? String(profile.sub).trim() : undefined;

    // Search first by googleId (primary identifier), then fallback to email lookup
    let user = null;
    if (sub) {
      user = await User.findOne({ googleId: sub });
    }
    if (!user) {
      user = await User.findOne({ email });
    }

    if (user) {
      let modified = false;
      if (sub && user.googleId !== sub) {
        user.googleId = sub;
        modified = true;
      }
      if (profile.picture && user.avatarUrl !== String(profile.picture).trim()) {
        user.avatarUrl = String(profile.picture).trim();
        modified = true;
      }
      if (modified) {
        try {
          await user.save();
        } catch (saveErr) {
          console.warn('[auth] Non-critical warning updating Google user metadata:', saveErr.message);
        }
      }
    } else {
      const displayName = (profile.name || email.split('@')[0] || 'User').trim().slice(0, 80);
      try {
        user = await User.create({
          name: displayName,
          email,
          googleId: sub,
          avatarUrl: profile.picture ? String(profile.picture).trim() : undefined,
          role: env.adminEmail && email === env.adminEmail ? 'admin' : 'developer',
        });
      } catch (createErr) {
        // Defend against race condition or duplicate key collision
        if (createErr?.code === 11000) {
          user = await User.findOne({ email });
          if (!user && sub) {
            user = await User.findOne({ googleId: sub });
          }
        }
        if (!user) {
          throw createErr;
        }
      }
    }

    await startSession(res, user);
    res.redirect(`${env.clientOrigin}/dashboard`);
  } catch (err) {
    console.error('[auth] Google OAuth callback exception:', err);
    const detail = !env.isProd && err?.message ? `: ${err.message}` : '';
    return res.redirect(
      `${env.clientOrigin}/login?error=${encodeURIComponent(
        `Google sign-in encountered an issue${detail}. Please try again.`
      )}`
    );
  }
});

/**
 * Permanently deletes the authenticated user's account and performs a cascading purge
 * of all associated projects, telemetry events, alerts, audits, and session tokens.
 */
export const deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  // 1. Identify all projects owned by the user
  const projects = await Project.find({ owner: userId }).select('_id key').lean();
  const projectIds = projects.map((p) => p._id);

  // 2. Cascade delete all telemetry data across user projects
  if (projectIds.length > 0) {
    await Promise.all([
      Event.deleteMany({ project: { $in: projectIds } }),
      Alert.deleteMany({ project: { $in: projectIds } }),
      Audit.deleteMany({ project: { $in: projectIds } }),
      Project.deleteMany({ _id: { $in: projectIds } }),
    ]);

    // Invalidate LRU cache entries for project keys
    for (const p of projects) {
      if (p.key) invalidateKey(p.key);
    }
  }

  // 3. Purge all refresh tokens / session families for the user
  await RefreshToken.deleteMany({ user: userId });

  // 4. Delete the User record
  await User.findByIdAndDelete(userId);

  // 5. Invalidate HTTP session cookies
  clearAuthCookies(res);

  res.status(204).end();
});


