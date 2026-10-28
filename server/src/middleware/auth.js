import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = req.cookies?.rum_access || (header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) return next(new AppError(401, 'Not signed in'));
  try {
    const payload = jwt.verify(token, env.accessSecret);
    // role comes from the token, so role changes apply after the next refresh
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError(401, 'Session expired'));
  }
}

export const authorize =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user?.role) ? next() : next(new AppError(403, 'You do not have access to this'));
