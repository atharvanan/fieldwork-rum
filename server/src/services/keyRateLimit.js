// Fixed-window rate limiter per project key (in-memory counter)
const windows = new Map();

export function allow(key, limitPerMinute) {
  const minute = Math.floor(Date.now() / 60_000);
  const entry = windows.get(key);
  if (!entry || entry.minute !== minute) {
    windows.set(key, { minute, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limitPerMinute;
}

setInterval(() => {
  const minute = Math.floor(Date.now() / 60_000);
  for (const [k, v] of windows) if (v.minute < minute) windows.delete(k);
}, 60_000).unref();
