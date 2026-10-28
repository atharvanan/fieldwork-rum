import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const ACCESS_TTL_MS = 15 * 60 * 1000;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const signAccess = (user) =>
  jwt.sign({ role: user.role }, env.accessSecret, { subject: String(user._id), expiresIn: '15m' });

export const signRefresh = (user) =>
  jwt.sign({ jti: crypto.randomUUID() }, env.refreshSecret, { subject: String(user._id), expiresIn: '7d' });

// refresh tokens are stored hashed
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
