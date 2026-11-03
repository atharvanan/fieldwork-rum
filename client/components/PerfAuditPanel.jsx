'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ago } from '@/lib/format';
import { exportToPdf, exportToWord, exportToHtml } from '@/lib/exportPerfReport';

const IMPACT_STYLES = {
  critical: {
    badge: 'bg-poor/10 text-poor border-poor/40',
    dot: 'bg-poor',
    label: 'Critical',
  },
  serious: {
    badge: 'bg-warn/15 text-warn border-warn/40',
    dot: 'bg-warn',
    label: 'Serious',
  },
  moderate: {
    badge: 'bg-accent/10 text-accent border-accent/40',
    dot: 'bg-accent',
    label: 'Moderate',
  },
  minor: {
    badge: 'bg-panel text-muted border-rule',
    dot: 'bg-muted',
    label: 'Minor',
  },
};

const RATING_STYLES = {
  good: {
    badge: 'bg-good/10 text-good border-good/40',
    label: 'Good',
  },
  'needs-improvement': {
    badge: 'bg-warn/15 text-warn border-warn/40',
    label: 'Needs work',
  },
  poor: {
    badge: 'bg-poor/10 text-poor border-poor/40',
    label: 'Poor',
  },
};

export default function PerfAuditPanel({ project }) {
  const queryClient = useQueryClient();
  const defaultUrl = project.domain ? `https://${project.domain}` : 'https://portfolio-website-pied-nine-28.vercel.app';

  const [url, setUrl] = useState(defaultUrl);
  const [strategy, setStrategy] = useState('mobile');
  const [selectedAuditId, setSelectedAuditId] = useState(null);
  const [impactFilter, setImpactFilter] = useState('all');
  const [expandedOpps, setExpandedOpps] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const toggleOpp = (id) => {
    setExpandedOpps((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const copyToClipboard = (text, id) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Fetch past performance audits
  const auditsQuery = useQuery({
    queryKey: ['perf-audits', project._id],
    queryFn: () => api(`/projects/${project._id}/perf-audits`),
  });

  // Run audit mutation
  const runMutation = useMutation({
    mutationFn: (customUrl) =>
      api(`/projects/${project._id}/perf-audits`, {
        method: 'POST',
        body: { url: customUrl || url, strategy },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['perf-audits', project._id], (old) => {
        const list = old?.audits ? [data.audit, ...old.audits.filter((a) => a._id !== data.audit._id)] : [data.audit];
        return { audits: list };
      });
      setSelectedAuditId(data.audit._id);
    },
  });

  // Delete audit mutation
  const deleteMutation = useMutation({
    mutationFn: (auditId) =>
      api(`/projects/${project._id}/perf-audits/${auditId}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, deletedId) => {
      queryClient.setQueryData(['perf-audits', project._id], (old) => {
        return { audits: (old?.audits || []).filter((a) => a._id !== deletedId) };
      });
      setSelectedAuditId(null);
    },
  });

  const audits = auditsQuery.data?.audits || [];
  const currentAudit =
    (selectedAuditId ? audits.find((a) => a._id === selectedAuditId) : audits[0]) || null;

  const scoreColor =
    (currentAudit?.score || 0) >= 90
      ? 'text-good'
      : (currentAudit?.score || 0) >= 50
      ? 'text-warn'
      : 'text-poor';

  const scoreStroke =
    (currentAudit?.score || 0) >= 90
      ? '#1F8A5B'
      : (currentAudit?.score || 0) >= 50
      ? '#B98100'
      : '#C23B22';

  const scoreRadius = 38;
  const scoreCircumference = 2 * Math.PI * scoreRadius;
  const scoreProgress = currentAudit
    ? scoreCircumference - (currentAudit.score / 100) * scoreCircumference
    : scoreCircumference;

  const filteredOpportunities = (currentAudit?.opportunities || []).filter((o) => {
    return impactFilter === 'all' || o.impact === impactFilter;
  });

  const copyFullReport = () => {
    if (!currentAudit) return;
    const lines = [
      `# Performance Audit Diagnostic Report for ${currentAudit.url}`,
      `Score: ${currentAudit.score}/100 | Strategy: ${currentAudit.strategy} | Status: HTTP ${currentAudit.statusCode || 200}`,
      '',
      '## Core Web Vitals (Simulated Lab)',
      `- LCP: ${currentAudit.vitals?.LCP?.display || 'N/A'} (${currentAudit.vitals?.LCP?.rating || ''})`,
      `- FCP: ${currentAudit.vitals?.FCP?.display || 'N/A'} (${currentAudit.vitals?.FCP?.rating || ''})`,
      `- CLS: ${currentAudit.vitals?.CLS?.display || 'N/A'} (${currentAudit.vitals?.CLS?.rating || ''})`,
      `- TBT: ${currentAudit.vitals?.TBT?.display || 'N/A'} (${currentAudit.vitals?.TBT?.rating || ''})`,
      `- TTFB: ${currentAudit.vitals?.TTFB?.display || 'N/A'} (${currentAudit.vitals?.TTFB?.rating || ''})`,
      `- Speed Index: ${currentAudit.vitals?.SpeedIndex?.display || 'N/A'} (${currentAudit.vitals?.SpeedIndex?.rating || ''})`,
      '',
      '## Optimization Opportunities & Problem Culprits',
    ];

    (currentAudit.opportunities || []).forEach((opp, i) => {
      lines.push(`\n### ${i + 1}. [${opp.impact.toUpperCase()}] ${opp.title}`);
      if (opp.savings) lines.push(`Estimated Savings: ${opp.savings}`);
      lines.push(`Summary: ${opp.description}`);
      if (opp.fixGuidance) lines.push(`Remediation Fix: ${opp.fixGuidance}`);
      if (opp.items?.length > 0) {
        lines.push('Problem Culprit Assets:');
        opp.items.forEach((item, itemIdx) => {
          lines.push(`  - Item ${itemIdx + 1}: ${item.url || 'HTML Element'}`);
          if (item.detail) lines.push(`    Issue: ${item.detail}`);
          if (item.snippet) lines.push(`    Snippet: ${item.snippet}`);
        });
      }
    });

    copyToClipboard(lines.join('\n'), 'full-report');
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="perf-heading" className="rounded border border-rule bg-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-5">
          <div>
            <h2 id="perf-heading" className="text-2xl font-medium text-ink">
              Instant URL Performance Audit
            </h2>
            <p className="mt-1 text-sm text-muted">
              Audit any live website without code changes. Measures simulated Core Web Vitals, payload weights, and render-blocking resources.
            </p>
          </div>

          {audits.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="perf-history-select" className="text-muted">
                Past audits:
              </label>
              <select
                id="perf-history-select"
                aria-label="Select previous performance audit"
                className="rounded border border-rule bg-paper px-2.5 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                value={currentAudit?._id || ''}
                onChange={(e) => setSelectedAuditId(e.target.value)}
              >
                {audits.map((a) => (
                  <option key={a._id} value={a._id}>
                    {ago(a.createdAt)} • {a.strategy === 'mobile' ? 'Mobile' : 'Desktop'} • Score {a.score}/100
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            runMutation.mutate();
          }}
        >
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <label className="label text-xs uppercase tracking-wider text-muted" htmlFor="perf-audit-url">
                Target URL to Audit (Any Public Website or App)
              </label>
              <input
                id="perf-audit-url"
                type="url"
                required
                className="field font-mono text-sm"
                placeholder="https://yourwebsite.com or https://apple.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div className="lg:col-span-4">
              <span className="label text-xs uppercase tracking-wider text-muted">
                Simulation Device
              </span>
              <div className="flex gap-2">
                <div role="group" aria-label="Device Strategy" className="inline-flex flex-1 rounded border border-rule">
                  {['mobile', 'desktop'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStrategy(s)}
                      className={`flex-1 border-l border-rule px-3 py-2 text-xs font-medium capitalize first:border-l-0 transition-colors ${
                        strategy === s
                          ? 'bg-ink text-paper'
                          : 'bg-transparent text-ink hover:bg-paper'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={runMutation.isPending}
                  className="btn-primary px-5 py-2 text-xs font-semibold whitespace-nowrap"
                >
                  {runMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Auditing...
                    </span>
                  ) : (
                    'Run Audit'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Quick preset tests for popular sites */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted">
            <span>Quick test presets:</span>
            {[
              { label: 'Your Portfolio', u: 'https://portfolio-website-pied-nine-28.vercel.app' },
              { label: 'AI Resume Ranker', u: 'https://ai-resume-ranker-gamma.vercel.app' },
              { label: 'Apple', u: 'https://www.apple.com' },
              { label: 'Samsung', u: 'https://www.samsung.com' },
              { label: 'Flipkart', u: 'https://www.flipkart.com' },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setUrl(preset.u);
                  runMutation.mutate(preset.u);
                }}
                disabled={runMutation.isPending}
                className="rounded border border-rule bg-paper px-2 py-0.5 text-xs text-ink hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </form>

        {runMutation.isError && (
          <div role="alert" className="mt-4 rounded border border-poor/40 bg-poor/10 p-3 text-sm text-poor">
            {runMutation.error.message || 'Audit failed. Please check the URL and try again.'}
          </div>
        )}
      </section>

      {/* Main Audit Display */}
      {currentAudit && (
        <div className="space-y-6">
          {/* Top Score Banner & Summary */}
          <div className="grid gap-6 md:grid-cols-12 rounded border border-rule bg-panel p-6">
            <div className="flex items-center gap-5 md:col-span-4 border-b md:border-b-0 md:border-r border-rule pb-5 md:pb-0 md:pr-6">
              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 96 96">
                  <circle cx="48" cy="48" r={scoreRadius} className="stroke-rule" strokeWidth="7" fill="none" />
                  <circle
                    cx="48"
                    cy="48"
                    r={scoreRadius}
                    stroke={scoreStroke}
                    strokeWidth="7"
                    strokeDasharray={scoreCircumference}
                    strokeDashoffset={scoreProgress}
                    strokeLinecap="round"
                    fill="none"
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className={`text-3xl font-bold ${scoreColor}`}>{currentAudit.score}</span>
                  <span className="text-[10px] uppercase text-muted">Score</span>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-ink">
                    {currentAudit.score >= 90 ? 'Fast & Optimized' : currentAudit.score >= 50 ? 'Needs Improvement' : 'Slow Performance'}
                  </h3>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  Tested on simulated <strong className="capitalize text-ink">{currentAudit.strategy}</strong>
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  Completed in {currentAudit.durationMs} ms
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between md:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="truncate">
                  <span className="text-xs text-muted">Audited URL:</span>
                  <p className="font-mono text-xs text-ink truncate max-w-md">{currentAudit.url}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                    currentAudit.statusCode >= 200 && currentAudit.statusCode < 400
                      ? 'border-good/40 bg-good/10 text-good'
                      : 'border-warn/40 bg-warn/15 text-warn'
                  }`}>
                    HTTP {currentAudit.statusCode || 200}
                  </span>

                  {/* Download Report Dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setExportMenuOpen(!exportMenuOpen)}
                      className="rounded border border-ink bg-ink text-paper px-2.5 py-1 text-xs font-medium hover:bg-ink/90 transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <span>Download Report</span>
                      <span className="text-[9px]">▼</span>
                    </button>

                    {exportMenuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setExportMenuOpen(false)}
                        />
                        <div className="absolute right-0 mt-1.5 w-52 rounded border border-rule bg-paper shadow-lg py-1.5 z-50 text-xs">
                          <div className="px-3 py-1 font-semibold text-[10px] uppercase text-muted tracking-wider border-b border-rule mb-1">
                            Export Full Audit Report
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              exportToPdf(currentAudit);
                              setExportMenuOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-panel flex items-center justify-between text-ink transition-colors"
                          >
                            <span className="font-medium">Print / Save as PDF</span>
                            <span className="text-[10px] text-muted font-mono bg-panel border border-rule rounded px-1.5">.pdf</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              exportToWord(currentAudit);
                              setExportMenuOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-panel flex items-center justify-between text-ink transition-colors"
                          >
                            <span className="font-medium">Microsoft Word</span>
                            <span className="text-[10px] text-muted font-mono bg-panel border border-rule rounded px-1.5">.doc</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              exportToHtml(currentAudit);
                              setExportMenuOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-panel flex items-center justify-between text-ink transition-colors"
                          >
                            <span className="font-medium">Standalone HTML</span>
                            <span className="text-[10px] text-muted font-mono bg-panel border border-rule rounded px-1.5">.html</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(currentAudit._id)}
                    disabled={deleteMutation.isPending}
                    className="rounded border border-rule px-2 py-0.5 text-xs text-muted hover:border-poor hover:text-poor transition-colors"
                  >
                    Delete Run
                  </button>
                </div>
              </div>

              {/* Resource Summary Cards */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <div className="rounded border border-rule bg-paper p-2.5 text-center">
                  <span className="text-[10px] uppercase text-muted">HTML Size</span>
                  <p className="text-sm font-semibold text-ink">
                    {Math.round((currentAudit.metrics?.htmlBytes || 0) / 1024)} KB
                  </p>
                </div>
                <div className="rounded border border-rule bg-paper p-2.5 text-center">
                  <span className="text-[10px] uppercase text-muted">Blocking</span>
                  <p className="text-sm font-semibold text-ink">
                    {currentAudit.metrics?.renderBlockingCount || 0}
                  </p>
                </div>
                <div className="rounded border border-rule bg-paper p-2.5 text-center">
                  <span className="text-[10px] uppercase text-muted">Scripts</span>
                  <p className="text-sm font-semibold text-ink">
                    {currentAudit.metrics?.scriptsCount || 0}
                  </p>
                </div>
                <div className="rounded border border-rule bg-paper p-2.5 text-center">
                  <span className="text-[10px] uppercase text-muted">Stylesheets</span>
                  <p className="text-sm font-semibold text-ink">
                    {currentAudit.metrics?.stylesheetsCount || 0}
                  </p>
                </div>
                <div className="rounded border border-rule bg-paper p-2.5 text-center">
                  <span className="text-[10px] uppercase text-muted">Images</span>
                  <p className="text-sm font-semibold text-ink">
                    {currentAudit.metrics?.imagesCount || 0}
                  </p>
                </div>
                <div className="rounded border border-rule bg-paper p-2.5 text-center">
                  <span className="text-[10px] uppercase text-muted">Third-Party</span>
                  <p className="text-sm font-semibold text-ink">
                    {currentAudit.metrics?.thirdPartyCount || 0}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Core Web Vitals Lab Metrics Grid */}
          <div className="rounded border border-rule bg-panel p-6">
            <h3 className="text-lg font-medium text-ink">Lab Core Web Vitals & Timing</h3>
            <p className="mt-0.5 text-xs text-muted">
              Simulated metric timings based on device performance models and resource dependencies.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { key: 'LCP', title: 'Largest Contentful Paint', limit: 'Good ≤ 2.50 s' },
                { key: 'FCP', title: 'First Contentful Paint', limit: 'Good ≤ 1.80 s' },
                { key: 'CLS', title: 'Cumulative Layout Shift', limit: 'Good ≤ 0.100' },
                { key: 'TBT', title: 'Total Blocking Time', limit: 'Good ≤ 200 ms' },
                { key: 'TTFB', title: 'Time to First Byte', limit: 'Good ≤ 800 ms' },
                { key: 'SpeedIndex', title: 'Speed Index', limit: 'Good ≤ 3.40 s' },
              ].map(({ key, title, limit }) => {
                const metric = currentAudit.vitals?.[key];
                if (!metric) return null;
                const style = RATING_STYLES[metric.rating] || RATING_STYLES.good;
                return (
                  <div key={key} className="rounded border border-rule bg-paper p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted">{key}</span>
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-medium ${style.badge}`}>
                        {style.label}
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-2xl font-bold font-display text-ink">{metric.display}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink font-medium">{title}</p>
                    <span className="text-[11px] text-muted">{limit}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actionable Opportunities & Diagnostics */}
          <div className="rounded border border-rule bg-panel p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-4">
              <div>
                <h3 className="text-lg font-medium text-ink">Optimization Opportunities & Diagnostics</h3>
                <p className="text-xs text-muted">
                  Specific remediation steps with exact problem asset URLs, HTML snippets, and code fixes.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Impact filter tabs */}
                <div className="flex items-center gap-1 text-xs">
                  {['all', 'critical', 'serious', 'moderate', 'minor'].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setImpactFilter(lvl)}
                      className={`rounded border px-2.5 py-1 text-xs capitalize transition-colors ${
                        impactFilter === lvl
                          ? 'border-ink bg-ink text-paper'
                          : 'border-rule bg-paper text-ink hover:bg-panel'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>

                {/* Export Report Actions */}
                {filteredOpportunities.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => exportToPdf(currentAudit)}
                      title="Open printable report and Save as PDF"
                      className="rounded border border-rule bg-paper px-2.5 py-1 text-xs text-ink hover:bg-panel hover:border-ink transition-colors flex items-center gap-1 font-medium"
                    >
                      <span>PDF Report</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => exportToWord(currentAudit)}
                      title="Download Microsoft Word .doc Document"
                      className="rounded border border-rule bg-paper px-2.5 py-1 text-xs text-ink hover:bg-panel hover:border-ink transition-colors flex items-center gap-1 font-medium"
                    >
                      <span>Word (.doc)</span>
                    </button>
                    <button
                      type="button"
                      onClick={copyFullReport}
                      title="Copy full text diagnostic breakdown"
                      className="rounded border border-rule bg-paper px-2.5 py-1 text-xs text-ink hover:bg-panel hover:border-ink transition-colors flex items-center gap-1.5 font-medium"
                    >
                      <span>{copiedId === 'full-report' ? 'Report Copied!' : 'Copy Text'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {filteredOpportunities.length === 0 ? (
              <div className="mt-6 rounded border border-rule bg-paper p-6 text-center text-sm text-muted">
                No optimization issues found matching this filter. Great job!
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {filteredOpportunities.map((opp, idx) => {
                  const oppKey = opp.id || `opp-${idx}`;
                  const isExpanded = expandedOpps[oppKey] ?? (idx === 0 || opp.impact === 'critical' || opp.impact === 'serious');
                  const style = IMPACT_STYLES[opp.impact] || IMPACT_STYLES.minor;
                  const itemsCount = opp.items?.length || 0;

                  return (
                    <div
                      key={oppKey}
                      className="rounded border border-rule bg-paper overflow-hidden transition-all shadow-sm"
                    >
                      {/* Interactive Header Bar */}
                      <div
                        className="flex flex-wrap items-center justify-between gap-3 p-4 cursor-pointer select-none hover:bg-panel/40 transition-colors"
                        onClick={() => toggleOpp(oppKey)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleOpp(oppKey);
                          }
                        }}
                        aria-expanded={isExpanded}
                      >
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${style.badge}`}>
                            {style.label}
                          </span>
                          <h4 className="text-sm font-semibold text-ink">{opp.title}</h4>
                          {itemsCount > 0 && (
                            <span className="rounded-full bg-panel border border-rule px-2 py-0.5 text-[10px] text-muted font-mono font-medium">
                              {itemsCount} {itemsCount === 1 ? 'culprit item' : 'culprit items'}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          {opp.savings && (
                            <span className="rounded bg-panel px-2 py-0.5 text-xs font-mono font-medium text-ink border border-rule">
                              Savings: {opp.savings}
                            </span>
                          )}
                          <button
                            type="button"
                            className="flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleOpp(oppKey);
                            }}
                          >
                            <span>{isExpanded ? 'Hide Details' : 'View Culprits & Fix'}</span>
                            <span className={`text-[10px] transition-transform duration-200 inline-block ${isExpanded ? 'rotate-180' : ''}`}>
                              ▼
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Brief Issue Summary */}
                      <div className="px-4 pb-3">
                        <p className="text-xs text-muted leading-relaxed">{opp.description}</p>
                      </div>

                      {/* Expandable Diagnostic Details Drawer */}
                      {isExpanded && (
                        <div className="border-t border-rule bg-panel/40 p-4 space-y-4">
                          {/* Developer Remediation & Code Fix */}
                          <div className="rounded border border-accent/30 bg-accent/5 p-3.5 space-y-1.5">
                            <span className="text-xs font-bold text-accent uppercase tracking-wider block">
                              Remediation Guidance & Technical Fix
                            </span>
                            <p className="text-xs text-ink leading-relaxed">
                              {opp.fixGuidance || 'Inspect the specific items below and adjust resource loading to eliminate main-thread bottlenecks.'}
                            </p>
                          </div>

                          {/* Problem Elements & Culprit Assets */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                                Identified Problem Assets & Code Locations ({itemsCount})
                              </span>
                              {itemsCount > 0 && (
                                <span className="text-[11px] text-muted">
                                  Showing top {Math.min(itemsCount, 25)} culprits
                                </span>
                              )}
                            </div>

                            {itemsCount === 0 ? (
                              <div className="rounded border border-rule bg-paper p-3 text-xs text-muted text-center">
                                No asset-level culprits cached for this audit run. Run a fresh audit above to inspect exact asset URLs and code snippets.
                              </div>
                            ) : (
                              <div className="space-y-2.5">
                                {opp.items.map((item, itemIdx) => {
                                  const copyKey = `item-${oppKey}-${itemIdx}`;
                                  const isCopied = copiedId === copyKey;
                                  const itemUrl = item.url || '';
                                  const isExternal = itemUrl.startsWith('http://') || itemUrl.startsWith('https://');

                                  return (
                                    <div
                                      key={itemIdx}
                                      className="rounded border border-rule bg-paper p-3 text-xs space-y-2 hover:border-ink/30 transition-colors"
                                    >
                                      <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="flex-1 min-w-[240px]">
                                          {itemUrl ? (
                                            <div className="flex items-center gap-2">
                                              {isExternal ? (
                                                <a
                                                  href={itemUrl}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="font-mono text-xs font-medium text-accent hover:underline break-all"
                                                  title={itemUrl}
                                                >
                                                  {itemUrl}
                                                </a>
                                              ) : (
                                                <span className="font-mono text-xs font-medium text-ink break-all">
                                                  {itemUrl}
                                                </span>
                                              )}
                                            </div>
                                          ) : (
                                            <span className="font-mono text-xs font-semibold text-ink">
                                              HTML Element
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                          {itemUrl && (
                                            <button
                                              type="button"
                                              onClick={() => copyToClipboard(itemUrl, copyKey)}
                                              className="rounded border border-rule bg-panel px-2 py-0.5 text-[11px] text-muted hover:text-ink hover:border-ink transition-colors"
                                            >
                                              {isCopied ? 'Copied URL!' : 'Copy URL'}
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {/* Technical Diagnosis */}
                                      {item.detail && (
                                        <div className="flex items-center gap-1.5 text-xs text-warn font-medium">
                                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-warn shrink-0" />
                                          <span>{item.detail}</span>
                                        </div>
                                      )}

                                      {/* Exact HTML or Code Snippet */}
                                      {item.snippet && (
                                        <div className="relative group mt-1.5">
                                          <pre className="overflow-x-auto rounded border border-rule bg-panel p-2 font-mono text-[11px] text-ink whitespace-pre-wrap break-all leading-normal select-all">
                                            {item.snippet}
                                          </pre>
                                          <button
                                            type="button"
                                            onClick={() => copyToClipboard(item.snippet, `snip-${oppKey}-${itemIdx}`)}
                                            className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 rounded border border-rule bg-paper px-2 py-0.5 text-[10px] text-muted hover:text-ink hover:border-ink transition-all shadow-sm"
                                          >
                                            {copiedId === `snip-${oppKey}-${itemIdx}` ? 'Copied Snippet!' : 'Copy Snippet'}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!currentAudit && !auditsQuery.isLoading && (
        <div className="rounded border border-rule bg-panel p-10 text-center">
          <h3 className="text-xl font-medium text-ink">No Lab Performance Audits Yet</h3>
          <p className="mt-1 text-sm text-muted max-w-md mx-auto">
            Enter any live website or web application URL above and click &quot;Run Audit&quot; to measure Core Web Vitals, page weight, and render blocking issues on the spot.
          </p>
        </div>
      )}
    </div>
  );
}

