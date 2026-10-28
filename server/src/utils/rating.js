// Threshold boundaries [good, poor] evaluated server-side for classification integrity
export const VITALS = {
  LCP: [2500, 4000],
  FCP: [1800, 3000],
  CLS: [0.1, 0.25],
  INP: [200, 500],
  TTFB: [800, 1800],
};

export const VITAL_NAMES = Object.keys(VITALS);

export function rateVital(name, value) {
  const t = VITALS[name];
  if (!t) return undefined;
  if (value <= t[0]) return 'good';
  if (value <= t[1]) return 'needs-improvement';
  return 'poor';
}
