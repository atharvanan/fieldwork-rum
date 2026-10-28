import { z } from 'zod';
import { VITAL_NAMES } from '../utils/rating.js';

const base = {
  path: z.string().min(1).max(300),
  sessionId: z.string().min(1).max(64),
  ts: z.number().finite().optional(),
};

const vital = z.object({
  type: z.literal('vital'),
  name: z.enum(VITAL_NAMES),
  value: z.number().finite().min(0).max(600000),
  ...base,
});
const error = z.object({
  type: z.literal('error'),
  message: z.string().min(1).max(500),
  stack: z.string().max(4000).optional(),
  ...base,
});
const pageview = z.object({ type: z.literal('pageview'), ...base });

export const eventSchema = z.discriminatedUnion('type', [vital, error, pageview]);

const envelope = z.object({
  key: z.string().min(8).max(100),
  release: z.string().max(60).optional(),
  events: z.array(z.unknown()).min(1).max(50),
});

// bad envelope = 400, a bad single event is just dropped
export function parseBatch(body) {
  const env = envelope.parse(body);
  const events = [];
  let dropped = 0;
  for (const raw of env.events) {
    const result = eventSchema.safeParse(raw);
    if (result.success) events.push(result.data);
    else dropped += 1;
  }
  return { key: env.key, release: env.release, events, dropped };
}
