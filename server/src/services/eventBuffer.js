import { Event } from '../models/Event.js';

/**
 * In-memory write buffer for telemetry ingestion.
 * Decouples client beacon requests from database write latency.
 * Flushes to MongoDB in batches of 500 documents or every 2,000ms.
 * Backpressure threshold: 20,000 pending events (triggers HTTP 503).
 */
const MAX_BATCH = 500;
const FLUSH_MS = 2000;
const MAX_QUEUE = 20000;

let queue = [];
let timer = null;
let flushing = false;
let dropped = 0;

export function enqueue(docs) {
  if (queue.length + docs.length > MAX_QUEUE) {
    dropped += docs.length;
    return false;
  }
  queue.push(...docs);
  if (queue.length >= MAX_BATCH) flush();
  return true;
}

export async function flush() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0, MAX_BATCH);
  let ok = true;
  try {
    await Event.insertMany(batch, { ordered: false });
  } catch (err) {
    ok = false;
    console.error('[buffer] flush failed:', err.message);
    if (queue.length + batch.length <= MAX_QUEUE) queue.unshift(...batch); // retry next tick
  } finally {
    flushing = false;
  }
  if (ok && queue.length >= MAX_BATCH) setImmediate(flush);
}

export function startBuffer() {
  timer = setInterval(flush, FLUSH_MS);
  timer.unref();
}

export async function stopBuffer() {
  clearInterval(timer);
  for (let i = 0; i < 20 && queue.length; i += 1) await flush();
}

export const bufferStats = () => ({ queued: queue.length, dropped });
