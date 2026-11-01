'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Shell from '@/components/Shell';
import Tabs from '@/components/Tabs';
import Gauge from '@/components/Gauge';
import Trend from '@/components/Trend';
import Breakdown from '@/components/Breakdown';
import ErrorsTable from '@/components/ErrorsTable';
import InstallPanel from '@/components/InstallPanel';
import AccessibilityPanel from '@/components/AccessibilityPanel';
import { api } from '@/lib/api';
import { useStat } from '@/lib/hooks';
import { ORDER } from '@/lib/vitals';
import { ago } from '@/lib/format';

const RANGES = [
  { value: '1h', label: '1h', fullLabel: '1 hour' },
  { value: '24h', label: '24h', fullLabel: '24 hours' },
  { value: '7d', label: '7d', fullLabel: '7 days' },
  { value: '30d', label: '30d', fullLabel: '30 days' },
];

export default function SitePage({ params }) {
  const { id } = params;
  const [view, setView] = useState('performance');
  const [range, setRange] = useState('7d');
  const [metric, setMetric] = useState('LCP');

  const project = useQuery({ queryKey: ['project', id], queryFn: () => api(`/projects/${id}`) });
  const loaded = Boolean(project.data);
  const alerts = useQuery({ queryKey: ['alerts', id], queryFn: () => api(`/projects/${id}/alerts`), enabled: loaded });
  const overview = useStat(id, 'overview', { range }, loaded);
  const vitals = useStat(id, 'vitals', { range }, loaded);

  if (project.error) {
    return (
      <Shell>
        <p role="alert" className="text-poor">{project.error.message}</p>
        <Link href="/dashboard" className="mt-3 inline-block text-accent underline underline-offset-4">Back to your sites</Link>
      </Shell>
    );
  }
  if (!project.data) {
    return (
      <Shell>
        <p className="text-muted">Loading</p>
      </Shell>
    );
  }
  const p = project.data.project;
  const o = overview.data;
  const hasNoData = o && o.vitalSamples === 0 && o.pageviews === 0 && o.errors === 0;
  const latestAlert = alerts.data?.alerts?.[0];

  return (
    <Shell>
      <Link href="/dashboard" className="text-sm text-muted underline underline-offset-4 hover:text-accent">All sites</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">{p.name}</h1>
          <p className="text-sm text-muted">{p.domain || 'Accepts data from any domain'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            label="Dashboard view"
            options={[
              { value: 'performance', label: 'Performance' },
              { value: 'accessibility', label: 'Accessibility' },
            ]}
            value={view}
            onChange={setView}
          />
          {view === 'performance' && (
            <Tabs label="Time range" options={RANGES} value={range} onChange={setRange} />
          )}
        </div>
      </div>

      {view === 'accessibility' ? (
        <div className="mt-8 space-y-12">
          <AccessibilityPanel project={p} />
          <InstallPanel key={p.key} project={p} />
        </div>
      ) : (
        <>
          {o && !hasNoData && (
            <p className="mt-4 text-lg num">
              {o.sessions.toLocaleString()} visitors viewed {o.pageviews.toLocaleString()} pages and hit {o.errors.toLocaleString()} errors.
            </p>
          )}

          {latestAlert && (
            <p role="status" className="mt-4 rounded border border-warn/50 bg-warn/10 px-3 py-2 text-sm">
              <strong className="font-medium">Error alert, {ago(latestAlert.createdAt)}.</strong> {latestAlert.message}
            </p>
          )}

          {hasNoData && (
            <div className="mt-6 rounded border border-rule bg-panel p-5">
              <h2 className="text-xl">No data in this range yet</h2>
              <p className="mt-1 text-muted">
                Add the install snippet below to your site, or open the demo page to send a few test events, then come back and refresh.
              </p>
              <a className="btn-primary mt-4" href={`/demo.html?key=${p.key}`} target="_blank" rel="noreferrer">Open the demo page</a>
            </div>
          )}

          <section aria-labelledby="measure-h" className="mt-10">
            <h2 id="measure-h" className="text-2xl">Core measurements</h2>
            <p className="text-sm text-muted">Select a measurement to see its trend and where it is slowest.</p>
            {vitals.isLoading && <p className="mt-4 text-muted">Loading measurements</p>}
            {vitals.error && <p role="alert" className="mt-4 text-poor">{vitals.error.message}</p>}
            <div className="mt-2 divide-y divide-rule border-y border-rule">
              {vitals.data &&
                ORDER.map((name) => {
                  const v = vitals.data.vitals.find((x) => x.name === name);
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={metric === name}
                      onClick={() => setMetric(name)}
                      className={`block w-full border-l-2 pl-4 text-left ${metric === name ? 'border-accent bg-panel' : 'border-transparent hover:bg-panel/60'}`}
                    >
                      <Gauge name={name} p75={v.p75} samples={v.samples} distribution={v.distribution} />
                    </button>
                  );
                })}
            </div>
          </section>

          <div className="mt-12 space-y-12">
            <Trend id={id} range={range} metric={metric} />
            <Breakdown id={id} range={range} metric={metric} />
            <ErrorsTable id={id} range={range} />
            <InstallPanel key={p.key} project={p} />
          </div>
        </>
      )}
    </Shell>
  );
}
