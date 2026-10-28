import { Project } from '../models/Project.js';

// Fast path LRU-bounded cache for project key verification (60s hit TTL, 10s negative cache TTL)
const cache = new Map();
const HIT_TTL = 60_000;
const MISS_TTL = 10_000;

export async function getProjectByKey(key) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const value = await Project.findOne({ key }).select('_id domain').lean();
  cache.set(key, { value, exp: Date.now() + (value ? HIT_TTL : MISS_TTL) });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return value;
}

export const invalidateKey = (key) => cache.delete(key);
