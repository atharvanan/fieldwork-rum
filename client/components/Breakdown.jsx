'use client';
import { useState } from 'react';
import { useStat } from '@/lib/hooks';
import { VITALS, rate, fmt, RATING_BG, RATING_TEXT } from '@/lib/vitals';
import Tabs from './Tabs';

const GROUPS = [
  { value: 'browser', label: 'Browser' },
  { value: 'os', label: 'System' },
  { value: 'device', label: 'Device' },
  { value: 'path', label: 'Page' },
  { value: 'release', label: 'Release' },
];

export default function Breakdown({ id, range, metric }) {
  const [by, setBy] = useState('release');
  const { data, isLoading, error } = useStat(id, 'breakdown', { range, metric, by });
  const max = VITALS[metric].t[1] * 1.5;
  const rows = data?.rows ?? [];

  return (
    <section aria-labelledby="where-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="where-h" className="text-2xl">Where {VITALS[metric].title.toLowerCase()} is slowest</h2>
          <p className="text-sm text-muted">Compare groups to find the release, browser or page that is dragging the number up.</p>
        </div>
        <Tabs label="Group by" options={GROUPS} value={by} onChange={setBy} />
      </div>
      {isLoading && <p className="mt-4 text-muted">Loading</p>}
      {error && <p role="alert" className="mt-4 text-poor">{error.message}</p>}
      {!isLoading && !error && rows.length === 0 && <p className="mt-4 text-muted">Nothing to compare yet.</p>}
      <ul className="mt-3 divide-y divide-rule">
        {rows.map((r) => {
          const rating = rate(metric, r.p75);
          return (
            <li key={r.label} className="grid grid-cols-[7rem_1fr_6.5rem] items-center gap-3 py-2 sm:grid-cols-[10rem_1fr_7rem]">
              <span className="truncate" title={r.label}>{r.label}</span>
              <div className="h-2 rounded-sm bg-rule/50">
                <div className={`h-2 rounded-sm ${RATING_BG[rating]}`} style={{ width: `${Math.min(r.p75 / max, 1) * 100}%` }} />
              </div>
              <span className="text-right num">
                <span className={`font-medium ${RATING_TEXT[rating]}`}>{fmt(metric, r.p75)}</span>
                <span className="block text-xs text-muted">{r.samples.toLocaleString()} samples</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
