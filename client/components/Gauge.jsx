import { VITALS, rate, fmt, RATING_LABEL, RATING_TEXT } from '@/lib/vitals';

/**
 * Visual gauge for Web Vitals thresholds and sample distributions.
 * Renders target thresholds (Good / Needs Improvement / Poor), 75th percentile indicator,
 * and visit distribution breakdown.
 */
export default function Gauge({ name, p75, samples, distribution }) {
  const meta = VITALS[name];
  const [good, poor] = meta.t;
  const max = poor * 1.5;
  const hasData = p75 != null;
  const rating = hasData ? rate(name, p75) : null;
  const pos = hasData ? Math.min(p75 / max, 1) * 100 : 0;
  const total = distribution ? distribution.good + distribution.needsImprovement + distribution.poor : 0;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className="grid gap-x-8 gap-y-2 py-4 sm:grid-cols-[14rem_1fr]">
      <div>
        <h3 className="text-lg leading-tight">{meta.title}</h3>
        <p className="text-sm text-muted">
          {name}, {meta.short}
        </p>
      </div>
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-display text-3xl num">{fmt(name, p75)}</span>
          {rating && <span className={`text-sm font-medium ${RATING_TEXT[rating]}`}>{RATING_LABEL[rating]}</span>}
          {samples ? <span className="text-xs sm:text-sm text-muted num sm:ml-auto">3 in 4 faster ({samples.toLocaleString()} samples)</span> : null}
        </div>

        <div
          className="relative mt-3"
          role="img"
          aria-label={hasData ? `${meta.title}: ${fmt(name, p75)}, rated ${RATING_LABEL[rating]}. Good up to ${fmt(name, good)}, poor above ${fmt(name, poor)}.` : `${meta.title}: no data yet`}
        >
          <div className="flex h-2 overflow-hidden rounded-sm">
            <div className="bg-good/30" style={{ width: `${(good / max) * 100}%` }} />
            <div className="bg-warn/30" style={{ width: `${((poor - good) / max) * 100}%` }} />
            <div className="flex-1 bg-poor/30" />
          </div>
          {hasData && <div className="absolute -top-1 h-4 w-0.5 bg-ink" style={{ left: `calc(${pos}% - 1px)` }} />}
        </div>
        <div className="relative mt-1 h-4 text-xs text-muted num" aria-hidden="true">
          <span className="absolute -translate-x-1/2" style={{ left: `${(good / max) * 100}%` }}>{fmt(name, good)}</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${(poor / max) * 100}%` }}>{fmt(name, poor)}</span>
        </div>

        {total > 0 && (
          <div className="mt-2">
            <div className="flex h-1 overflow-hidden rounded-sm" aria-hidden="true">
              <div className="bg-good" style={{ width: `${pct(distribution.good)}%` }} />
              <div className="bg-warn" style={{ width: `${pct(distribution.needsImprovement)}%` }} />
              <div className="bg-poor" style={{ width: `${pct(distribution.poor)}%` }} />
            </div>
            <p className="mt-1 text-sm text-muted num">
              {pct(distribution.good)}% of visits good, {pct(distribution.needsImprovement)}% need work, {pct(distribution.poor)}% poor
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
