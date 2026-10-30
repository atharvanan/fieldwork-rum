'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ago } from '@/lib/format';

const IMPACT_STYLES = {
  critical: {
    badge: 'bg-rose-500/10 text-rose-600 border border-rose-500/30',
    dot: 'bg-rose-500',
    label: 'Critical',
  },
  serious: {
    badge: 'bg-amber-500/10 text-amber-700 border border-amber-500/30',
    dot: 'bg-amber-500',
    label: 'Serious',
  },
  moderate: {
    badge: 'bg-blue-500/10 text-blue-700 border border-blue-500/30',
    dot: 'bg-blue-500',
    label: 'Moderate',
  },
  minor: {
    badge: 'bg-slate-500/10 text-slate-700 border border-slate-500/30',
    dot: 'bg-slate-400',
    label: 'Minor',
  },
};

const WCAG_LEVEL_STYLES = {
  A: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  AA: 'bg-indigo-50 text-indigo-700 border-indigo-300',
  AAA: 'bg-purple-50 text-purple-700 border-purple-300',
};

const STANDARD_DESCRIPTIONS = {
  A: 'Essential baseline: 9 core checks (screen reader accessibility, alt text, form labels, unique IDs, landmarks).',
  AA: 'Standard industry & legal conformance: 14 checks (Level A + color contrast 4.5:1, zoom lock, heading hierarchy).',
  AAA: 'Highest accessibility conformance: 20 checks (Level A & AA + enhanced contrast 7:1, no text justification, location breadcrumbs).',
};

export default function AccessibilityPanel({ project }) {
  const queryClient = useQueryClient();
  const defaultUrl = project.domain ? `https://${project.domain}` : 'http://localhost:3000/demo.html';

  const [url, setUrl] = useState(defaultUrl);
  const [targetLevel, setTargetLevel] = useState('AA');
  const [selectedAuditId, setSelectedAuditId] = useState(null);
  const [activeTab, setActiveTab] = useState('violations'); // 'violations' | 'passes'
  const [impactFilter, setImpactFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [copiedIndex, setCopiedIndex] = useState(null);

  // Fetch past audits
  const auditsQuery = useQuery({
    queryKey: ['audits', project._id],
    queryFn: () => api(`/projects/${project._id}/audits`),
  });

  // Run audit mutation
  const runMutation = useMutation({
    mutationFn: () =>
      api(`/projects/${project._id}/audits`, {
        method: 'POST',
        body: { url, targetLevel },
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['audits', project._id] });
      setSelectedAuditId(data.audit._id);
    },
  });

  const audits = auditsQuery.data?.audits || [];
  const currentAudit =
    (selectedAuditId ? audits.find((a) => a._id === selectedAuditId) : audits[0]) || null;

  const copyToClipboard = (text, idx) => {
    navigator.clipboard?.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const filteredViolations = (currentAudit?.violations || []).filter((v) => {
    const matchesImpact = impactFilter === 'all' || v.impact === impactFilter;
    const matchesLevel = levelFilter === 'all' || v.wcagLevel === levelFilter;
    return matchesImpact && matchesLevel;
  });

  const scoreColor =
    (currentAudit?.score || 0) >= 90
      ? 'text-emerald-600'
      : (currentAudit?.score || 0) >= 70
      ? 'text-amber-600'
      : 'text-rose-600';

  const scoreStroke =
    (currentAudit?.score || 0) >= 90
      ? '#059669'
      : (currentAudit?.score || 0) >= 70
      ? '#D97706'
      : '#E11D48';

  const scoreRadius = 38;
  const scoreCircumference = 2 * Math.PI * scoreRadius;
  const scoreProgress = currentAudit
    ? scoreCircumference - (currentAudit.score / 100) * scoreCircumference
    : scoreCircumference;

  return (
    <div className="space-y-6">
      {/* Top Banner / Audit Launch Card */}
      <section className="rounded-lg border border-rule/80 bg-panel p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule/60 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-accent">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              <h2 className="text-xl font-semibold text-ink">
                WCAG Accessibility Assessment
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted">
              W3C WCAG 2.1 Conformance Standards Scanner for Levels A, AA, and AAA.
            </p>
          </div>

          {audits.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="history-select" className="flex items-center gap-1.5 text-muted">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                History:
              </label>
              <select
                id="history-select"
                aria-label="Select previous audit"
                className="rounded border border-rule/80 bg-canvas px-2.5 py-1 text-xs font-medium text-ink focus:border-accent focus:outline-none"
                value={currentAudit?._id || ''}
                onChange={(e) => setSelectedAuditId(e.target.value)}
              >
                {audits.map((a) => (
                  <option key={a._id} value={a._id}>
                    {ago(a.createdAt)} • Level {a.targetLevel} • Score {a.score}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Audit Runner Form */}
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            runMutation.mutate();
          }}
        >
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="audit-url">
                Target URL to Audit
              </label>
              <div className="relative">
                <input
                  id="audit-url"
                  type="url"
                  required
                  className="w-full rounded border border-rule bg-canvas px-3.5 py-2 pl-9 font-mono text-xs text-ink placeholder:text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="https://yourwebsite.com/page"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <span className="pointer-events-none absolute left-3 top-2.5 text-muted">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="lg:col-span-5">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
                WCAG Conformance Standard
              </label>
              <div className="flex gap-2">
                <div className="flex flex-1 rounded border border-rule/80 bg-canvas p-0.5">
                  {['A', 'AA', 'AAA'].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setTargetLevel(lvl)}
                      className={`flex-1 rounded py-1.5 text-xs font-medium transition-all ${
                        targetLevel === lvl
                          ? 'bg-ink text-white shadow-sm font-semibold'
                          : 'text-muted hover:text-ink'
                      }`}
                    >
                      Level {lvl}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={runMutation.isPending}
                  className="btn-primary inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-semibold shadow-sm transition-all hover:shadow"
                >
                  {runMutation.isPending ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Auditing...</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Run WCAG Audit</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded bg-canvas/70 px-3 py-2 text-[11px] text-muted border border-rule/50">
            <span className="font-semibold text-ink">Level {targetLevel} Scope:</span>
            <span>{STANDARD_DESCRIPTIONS[targetLevel]}</span>
          </div>
        </form>

        {runMutation.error && (
          <div role="alert" className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-700">
            <strong>Audit Error:</strong> {runMutation.error.message}
          </div>
        )}
      </section>

      {/* Audit Results Section */}
      {currentAudit ? (
        <div className="space-y-6">
          {/* Executive Scorecard */}
          <section className="grid gap-4 rounded-lg border border-rule/80 bg-panel p-6 shadow-sm md:grid-cols-12">
            {/* Score Ring */}
            <div className="flex items-center gap-5 border-b border-rule/60 pb-5 md:col-span-4 md:border-b-0 md:border-r md:pb-0 md:pr-6">
              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                <svg className="h-24 w-24 -rotate-90 transform" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r={scoreRadius}
                    className="stroke-rule/40"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={scoreRadius}
                    stroke={scoreStroke}
                    strokeWidth="8"
                    strokeDasharray={scoreCircumference}
                    strokeDashoffset={scoreProgress}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`font-display text-3xl font-bold num ${scoreColor}`}>
                    {currentAudit.score}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted">/ 100</span>
                </div>
              </div>

              <div>
                <span className="inline-block rounded-full bg-canvas px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider border border-rule/70 text-ink">
                  WCAG 2.1 {currentAudit.targetLevel}
                </span>
                <p className="mt-1.5 text-xs font-semibold text-ink">
                  {currentAudit.score >= 90
                    ? 'Excellent Conformance'
                    : currentAudit.score >= 70
                    ? 'Moderate Accessibility Risk'
                    : 'Action Required'}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {currentAudit.summary?.violationsCount === 0
                    ? 'All evaluated criteria passed'
                    : `${currentAudit.summary?.violationsCount} issues detected`}
                </p>
              </div>
            </div>

            {/* Violations vs Passes Stat */}
            <div className="flex flex-col justify-center border-b border-rule/60 pb-5 md:col-span-3 md:border-b-0 md:border-r md:pb-0 md:px-6">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Audit Summary</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold text-rose-600 num">
                  {currentAudit.summary?.violationsCount || 0}
                </span>
                <span className="text-xs text-muted">violations</span>
                <span className="mx-1 text-muted/40">•</span>
                <span className="font-display text-2xl font-bold text-emerald-600 num">
                  {currentAudit.summary?.passesCount || 0}
                </span>
                <span className="text-xs text-muted">passed</span>
              </div>

              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-rule/30">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${
                      currentAudit.summary?.passesCount + currentAudit.summary?.violationsCount > 0
                        ? (currentAudit.summary.passesCount /
                            (currentAudit.summary.passesCount + currentAudit.summary.violationsCount)) *
                          100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Standard Levels Breakdown */}
            <div className="flex flex-col justify-center border-b border-rule/60 pb-5 md:col-span-3 md:border-b-0 md:border-r md:pb-0 md:px-6">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">By Standard Level</span>
              <div className="mt-2.5 flex items-center gap-2 text-xs">
                {['A', 'AA', 'AAA'].map((lvl) => {
                  const count = currentAudit.summary?.byWcag?.[lvl] || 0;
                  const isAudited =
                    lvl === 'A' ||
                    (lvl === 'AA' && (currentAudit.targetLevel === 'AA' || currentAudit.targetLevel === 'AAA')) ||
                    (lvl === 'AAA' && currentAudit.targetLevel === 'AAA');

                  return (
                    <div
                      key={lvl}
                      className={`flex-1 rounded border px-2 py-1.5 text-center transition-all ${
                        !isAudited
                          ? 'border-rule/40 bg-canvas/30 opacity-40'
                          : count === 0
                          ? 'border-emerald-200 bg-emerald-50/50 text-emerald-800'
                          : 'border-rose-200 bg-rose-50/50 text-rose-800'
                      }`}
                    >
                      <div className="text-[10px] font-bold text-muted uppercase">Lvl {lvl}</div>
                      <div className="mt-0.5 font-bold num text-xs">
                        {isAudited ? (count === 0 ? '✓ Pass' : `${count} Fail`) : 'N/A'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Target Page Info */}
            <div className="flex flex-col justify-center md:col-span-2 md:pl-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Target Page</span>
              <p className="mt-1 text-xs font-medium text-ink">{ago(currentAudit.createdAt)}</p>
              <a
                href={currentAudit.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex items-center gap-1 truncate font-mono text-[11px] text-accent hover:underline"
                title={currentAudit.url}
              >
                <span className="truncate">{currentAudit.url.replace(/^https?:\/\//, '')}</span>
                <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              {currentAudit.durationMs > 0 && (
                <span className="mt-1 text-[10px] text-muted">Latency: {currentAudit.durationMs}ms</span>
              )}
            </div>
          </section>

          {/* Navigation Tabs (Violations vs Passed Checks) & Filters */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule/70 pb-3">
            {/* Main Tabs */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('violations')}
                className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  activeTab === 'violations'
                    ? 'bg-ink text-white shadow-sm'
                    : 'bg-panel text-muted hover:text-ink border border-rule/70'
                }`}
              >
                <span>Violations</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  activeTab === 'violations' ? 'bg-white/20 text-white' : 'bg-rule/40 text-muted'
                }`}>
                  {currentAudit.violations?.length || 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('passes')}
                className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  activeTab === 'passes'
                    ? 'bg-ink text-white shadow-sm'
                    : 'bg-panel text-muted hover:text-ink border border-rule/70'
                }`}
              >
                <span>Passed Criteria</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  activeTab === 'passes' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {currentAudit.passes?.length || currentAudit.summary?.passesCount || 0}
                </span>
              </button>
            </div>

            {/* Filters for Violations */}
            {activeTab === 'violations' && currentAudit.violations?.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Level Filter */}
                <div className="flex items-center rounded border border-rule/80 bg-panel p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setLevelFilter('all')}
                    className={`rounded px-2.5 py-1 font-medium transition-colors ${
                      levelFilter === 'all' ? 'bg-ink text-white' : 'text-muted hover:text-ink'
                    }`}
                  >
                    All Levels
                  </button>
                  {['A', 'AA', 'AAA'].map((lvl) => {
                    const count = currentAudit.summary?.byWcag?.[lvl] || 0;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setLevelFilter(lvl)}
                        className={`rounded px-2 py-1 font-medium transition-colors ${
                          levelFilter === lvl
                            ? 'bg-ink text-white'
                            : count > 0
                            ? 'text-ink hover:bg-canvas'
                            : 'text-muted/60 opacity-50'
                        }`}
                      >
                        Lvl {lvl} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Severity Filter */}
                <div className="flex items-center rounded border border-rule/80 bg-panel p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setImpactFilter('all')}
                    className={`rounded px-2.5 py-1 font-medium transition-colors ${
                      impactFilter === 'all' ? 'bg-ink text-white' : 'text-muted hover:text-ink'
                    }`}
                  >
                    All Severities
                  </button>
                  {['critical', 'serious', 'moderate', 'minor'].map((imp) => {
                    const count = currentAudit.summary?.byImpact?.[imp] || 0;
                    return (
                      <button
                        key={imp}
                        type="button"
                        onClick={() => setImpactFilter(imp)}
                        className={`rounded px-2 py-1 capitalize font-medium transition-colors ${
                          impactFilter === imp
                            ? 'bg-ink text-white'
                            : count > 0
                            ? 'text-ink hover:bg-canvas'
                            : 'text-muted/50 opacity-40'
                        }`}
                      >
                        {imp} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* TAB 1: VIOLATIONS LIST */}
          {activeTab === 'violations' && (
            <div>
              {currentAudit.violations?.length === 0 ? (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50/50 p-10 text-center shadow-sm">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="mt-3 font-display text-2xl font-bold text-emerald-900">
                    Zero Accessibility Violations!
                  </h3>
                  <p className="mt-1 text-sm text-emerald-700">
                    This page fully satisfies all audited WCAG 2.1 Level {currentAudit.targetLevel} criteria.
                  </p>
                </div>
              ) : filteredViolations.length === 0 ? (
                <div className="rounded-lg border border-rule/60 bg-panel p-8 text-center text-xs text-muted">
                  No violations match the active filters ({levelFilter !== 'all' ? `Level ${levelFilter}` : ''}{' '}
                  {impactFilter !== 'all' ? impactFilter : ''}).
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredViolations.map((violation, vIdx) => {
                    const impact = IMPACT_STYLES[violation.impact] || IMPACT_STYLES.minor;
                    const wcagLevelStyle = WCAG_LEVEL_STYLES[violation.wcagLevel] || 'border-rule text-ink';

                    return (
                      <article
                        key={violation.ruleId}
                        className="overflow-hidden rounded-lg border border-rule/80 bg-panel shadow-sm transition-all hover:border-rule"
                      >
                        {/* Violation Header */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/60 bg-canvas/80 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${impact.badge}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${impact.dot}`} />
                              {impact.label}
                            </span>

                            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${wcagLevelStyle}`}>
                              WCAG {violation.wcagLevel}
                            </span>

                            <code className="rounded bg-panel px-2 py-0.5 font-mono text-xs font-bold text-ink border border-rule/60">
                              {violation.ruleId}
                            </code>
                          </div>

                          {violation.helpUrl && (
                            <a
                              href={violation.helpUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                            >
                              <span>W3C Specification</span>
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          )}
                        </div>

                        {/* Violation Body */}
                        <div className="p-4 space-y-3">
                          <p className="text-sm font-medium text-ink leading-relaxed">
                            {violation.description}
                          </p>

                          {/* Remediation Guide */}
                          <div className="rounded-md border border-accent/20 bg-accent/5 p-3 text-xs">
                            <div className="flex items-start gap-2">
                              <span className="text-accent shrink-0 mt-0.5">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                </svg>
                              </span>
                              <div>
                                <strong className="font-semibold text-accent">Remediation Guide:</strong>{' '}
                                <span className="text-ink/80">{violation.help}</span>
                              </div>
                            </div>
                          </div>

                          {/* Problematic DOM Nodes */}
                          {violation.nodes?.length > 0 && (
                            <div className="pt-2">
                              <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted">
                                <span>Failing Elements ({violation.nodes.length})</span>
                              </div>

                              <div className="space-y-2">
                                {violation.nodes.map((node, nodeIdx) => {
                                  const selector = node.target?.join(' ') || 'Element';
                                  const copyKey = `${vIdx}-${nodeIdx}`;

                                  return (
                                    <div
                                      key={nodeIdx}
                                      className="rounded-md border border-rule/70 bg-canvas p-3 text-xs space-y-1.5"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-mono text-[11px] font-semibold text-accent">
                                          {selector}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => copyToClipboard(node.html, copyKey)}
                                          className="text-[10px] font-semibold text-muted hover:text-ink transition-colors flex items-center gap-1"
                                        >
                                          {copiedIndex === copyKey ? (
                                            <span className="text-emerald-600">Copied!</span>
                                          ) : (
                                            <>
                                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                              </svg>
                                              <span>Copy HTML</span>
                                            </>
                                          )}
                                        </button>
                                      </div>

                                      <pre className="overflow-x-auto rounded bg-ink/5 p-2 font-mono text-[11px] text-ink border border-rule/40">
                                        {node.html}
                                      </pre>

                                      {node.failureSummary && (
                                        <p className="text-[11px] font-medium text-rose-700 flex items-center gap-1">
                                          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                          </svg>
                                          <span>{node.failureSummary}</span>
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PASSED CRITERIA LIST */}
          {activeTab === 'passes' && (
            <div className="rounded-lg border border-rule/80 bg-panel p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between border-b border-rule/60 pb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Passed WCAG Criteria ({currentAudit.passes?.length || currentAudit.summary?.passesCount || 0})
                </span>
                <span className="text-xs text-emerald-700 font-medium">
                  Compliant with tested Level {currentAudit.targetLevel} criteria
                </span>
              </div>

              {currentAudit.passes && currentAudit.passes.length > 0 ? (
                <div className="divide-y divide-rule/50">
                  {currentAudit.passes.map((pass, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5 text-xs">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                        <span className="font-medium text-ink">{pass.description}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-canvas px-2 py-0.5 font-mono text-[10px] text-muted border border-rule/60">
                          {pass.ruleId}
                        </span>
                        <span className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          Lvl {pass.wcagLevel}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-muted">
                  {currentAudit.summary?.passesCount || 0} checks passed for Level {currentAudit.targetLevel}. Run a new audit to view the full detailed checklist of passing criteria.
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <section className="rounded-lg border border-rule/70 bg-panel p-12 text-center text-muted shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-canvas border border-rule/80 text-muted">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="mt-4 font-display text-lg font-semibold text-ink">No WCAG Audits Recorded Yet</h3>
          <p className="mt-1 text-xs text-muted max-w-md mx-auto">
            Choose your target standard (Level A, AA, or AAA), enter your website or local testing page URL, and click <strong>"Run WCAG Audit"</strong>.
          </p>
        </section>
      )}
    </div>
  );
}
