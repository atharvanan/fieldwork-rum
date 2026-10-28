import { env } from '../config/env.js';
import { parseBatch } from '../validators/ingest.js';
import { getProjectByKey } from '../services/projectCache.js';
import { allow } from '../services/keyRateLimit.js';
import { enqueue } from '../services/eventBuffer.js';
import { parseUA } from '../utils/ua.js';
import { rateVital } from '../utils/rating.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function originAllowed(origin, domain) {
  try {
    const host = new URL(origin).hostname;
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

// Guard against client clock drift; clamp timestamp if outside bounds (-24h to +5m)
function clampTs(ts, now) {
  if (typeof ts !== 'number' || ts > now + 5 * 60_000 || ts < now - 24 * 3600_000) return now;
  return ts;
}

export const ingest = asyncHandler(async (req, res) => {
  // navigator.sendBeacon sends text/plain to avoid CORS preflight, requiring manual JSON parse
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      throw new AppError(400, 'Invalid JSON');
    }
  }
  const { key, release, events, dropped } = parseBatch(body ?? {});

  const project = await getProjectByKey(key);
  if (!project) throw new AppError(401, 'Unknown project key');
  if (!allow(key, env.ingestRatePerMin)) throw new AppError(429, 'Too many events, slow down');

  const origin = req.get('origin');
  if (project.domain && origin && !originAllowed(origin, project.domain)) {
    throw new AppError(403, 'This origin is not allowed for this site');
  }

  const ua = parseUA(req.get('user-agent') || '');
  const now = Date.now();
  const docs = events.map((e) => {
    const isVital = e.type === 'vital';
    return {
      project: project._id,
      type: e.type,
      name: isVital ? e.name : undefined,
      value: isVital ? e.value : undefined,
      rating: isVital ? rateVital(e.name, e.value) : undefined,
      path: e.path,
      sessionId: e.sessionId,
      message: e.message,
      stack: e.stack,
      release,
      ...ua,
      ts: new Date(clampTs(e.ts, now)),
    };
  });

  if (!enqueue(docs)) throw new AppError(503, 'Server is busy, retry shortly');
  res.status(202).json({ accepted: docs.length, dropped });
});
