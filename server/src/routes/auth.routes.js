import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { register, login, refresh, logout, me, googleAuth, googleCallback, deleteAccount } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

const tooMany = { error: 'Too many attempts. Try again in a few minutes.' };

// only failed logins count so a shared office IP doesn't get locked out
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.registerRatePerHour,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});

const router = Router();
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.delete('/me', requireAuth, deleteAccount);

router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);

export default router;
