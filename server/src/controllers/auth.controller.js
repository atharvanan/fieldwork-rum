import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { RefreshToken } from '../models/RefreshToken.js';
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

const publicUser = (u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role });

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
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
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
