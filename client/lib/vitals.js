// same limits as server/src/utils/rating.js
export const ORDER = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];

export const VITALS = {
  LCP: { title: 'Main content visible', short: 'Largest Contentful Paint', t: [2500, 4000] },
  INP: { title: 'Response to taps and clicks', short: 'Interaction to Next Paint', t: [200, 500] },
  CLS: { title: 'Layout stability', short: 'Cumulative Layout Shift', t: [0.1, 0.25] },
  FCP: { title: 'First paint', short: 'First Contentful Paint', t: [1800, 3000] },
  TTFB: { title: 'Server response', short: 'Time to First Byte', t: [800, 1800] },
};

export function rate(name, value) {
  const [good, poor] = VITALS[name].t;
  return value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor';
}

export function fmt(name, value) {
  if (value == null) return 'No data';
  if (name === 'CLS') return value.toFixed(3);
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

export const RATING_LABEL = { good: 'Good', 'needs-improvement': 'Needs work', poor: 'Poor' };
// full class names so tailwind picks them up
export const RATING_TEXT = { good: 'text-good', 'needs-improvement': 'text-warn', poor: 'text-poor' };
export const RATING_BG = { good: 'bg-good', 'needs-improvement': 'bg-warn', poor: 'bg-poor' };
