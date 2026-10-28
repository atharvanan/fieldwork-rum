import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

export const notFound = (req, res, next) => next(new AppError(404, 'Not found'));

export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Some fields are invalid',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err?.code === 11000) return res.status(409).json({ error: 'That value is already in use' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err instanceof AppError) return res.status(err.status).json({ error: err.message });

  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong on our side' });
}
