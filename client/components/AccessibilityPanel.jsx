'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ago } from '@/lib/format';

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

const WCAG_LEVEL_STYLES = {
  A: 'bg-good/10 text-good border-good/40',
  AA: 'bg-accent/10 text-accent border-accent/40',
  AAA: 'bg-ink/10 text-ink border-ink/40',
};

const STANDARD_DESCRIPTIONS = {
  A: 'Essential baseline: 9 core checks (screen reader accessibility, alt text, form labels, unique IDs, button names).',
  AA: 'Standard legal compliance (ADA & Section 508): 16 checks (Level A + main landmark, color contrast 4.5:1, zoom lock, skip link).',
  AAA: 'Enhanced specialist standard: 22 checks (Level A & AA + enhanced 7:1 contrast, justified text prohibition, location breadcrumbs).',
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
      queryClient.setQueryData(['audits', project._id], (old) => {
        const list = old?.audits ? [data.audit, ...old.audits.filter((a) => a._id !== data.audit._id)] : [data.audit];
        return { audits: list };
      });
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
      ? 'text-good'
      : (currentAudit?.score || 0) >= 70
      ? 'text-warn'
      : 'text-poor';

  const scoreStroke =
    (currentAudit?.score || 0) >= 90
      ? '#1F8A5B'
      : (currentAudit?.score || 0) >= 70
      ? '#B98100'
      : '#C23B22';

  const scoreRadius = 38;
  const scoreCircumference = 2 * Math.PI * scoreRadius;
  const scoreProgress = currentAudit
    ? scoreCircumference - (currentAudit.score / 100) * scoreCircumference
    : scoreCircumference;

  return (
    <div className="space-y-6">
      <section aria-labelledby="a11y-heading" className="rounded border border-rule bg-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-5">
          <div>
            <h2 id="a11y-heading" className="text-2xl font-medium text-ink">
              WCAG Accessibility Assessment
            </h2>
            <p className="mt-1 text-sm text-muted">
              W3C WCAG 2.1 Conformance Standards Scanner for Levels A, AA, and AAA.
            </p>
          </div>

          {audits.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="history-select" className="text-muted">
                Past audits:
              </label>
              <select
                id="history-select"
                aria-label="Select previous audit"
                className="rounded border border-rule bg-paper px-2.5 py-1 text-xs text-ink focus:border-accent focus:outline-none"
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

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            runMutation.mutate();
          }}
        >
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <label className="label text-xs uppercase tracking-wider text-muted" htmlFor="audit-url">
                Target URL to Audit
              </label>
              <input
                id="audit-url"
                type="url"
                required
                className="field font-mono text-sm"
                placeholder="https://yourwebsite.com/page"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>

            <div className="lg:col-span-5">
              <span className="label text-xs uppercase tracking-wider text-muted">
                WCAG Conformance Standard
              </span>
              <div className="flex gap-2">
                <div role="group" aria-label="WCAG Standard" className="inline-flex flex-1 rounded border border-rule">
                  {['A', 'AA', 'AAA'].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setTargetLevel(lvl)}
                      className={`flex-1 border-l border-rule px-3 py-2 text-xs font-medium first:border-l-0 transition-colors ${
                        targetLevel === lvl
                          ? 'bg-ink text-paper'
                          : 'bg-transparent text-ink hover:bg-paper'
                      }`}
                    >
                      Level {lvl}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={runMutation.isPending}
                  className="btn-primary px-5 py-2 text-xs font-semibold"
                >
                  {runMutation.isPending ? (
                    <>
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Auditing...</span>
                    </>
                  ) : (
                    <span>Run WCAG Audit</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="rounded border border-rule bg-paper px-3 py-2 text-xs text-muted">
            <strong className="text-ink">Level {targetLevel} Scope:</strong> {STANDARD_DESCRIPTIONS[targetLevel]}
          </div>
        </form>

        {runMutation.error && (
          <div role="alert" className="mt-4 rounded border border-poor/40 bg-poor/5 p-3 text-xs text-poor">
            <strong>Audit Error:</strong> {runMutation.error.message}
          </div>
        )}
      </section>

      {currentAudit ? (
        <div className="space-y-6">
          <section className="grid gap-4 rounded border border-rule bg-panel p-6 md:grid-cols-12">
            <div className="flex items-center gap-5 border-b border-rule pb-5 md:col-span-4 md:border-b-0 md:border-r md:pb-0 md:pr-6">
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
                    className="transition-all duration-700 ease-out"
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
                <span className="rounded border border-rule bg-paper px-2 py-0.5 text-xs font-semibold text-ink">
                  WCAG 2.1 {currentAudit.targetLevel}
                </span>
                <p className="mt-2 text-sm font-medium text-ink">
                  {currentAudit.score >= 90
                    ? 'Excellent Conformance'
                    : currentAudit.score >= 70
                    ? 'Moderate Accessibility Risk'
                    : 'Action Required'}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {currentAudit.summary?.violationsCount === 0
                    ? 'All evaluated criteria passed'
                    : `${currentAudit.summary?.violationsCount} issues detected`}
                </p>
              </div>
            </div>

            {/* Violations vs Passes Stat */}
            <div className="flex flex-col justify-center border-b border-rule pb-5 md:col-span-3 md:border-b-0 md:border-r md:pb-0 md:px-6">
              <span className="text-xs uppercase tracking-wider text-muted">Audit Summary</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-2xl text-poor num font-bold">
                  {currentAudit.summary?.violationsCount || 0}
                </span>
                <span className="text-xs text-muted">violations</span>
                <span className="text-muted/40">•</span>
                <span className="font-display text-2xl text-good num font-bold">
                  {currentAudit.summary?.passesCount || 0}
                </span>
                <span className="text-xs text-muted">passed</span>
              </div>

              <div className="mt-3 h-2 w-full overflow-hidden rounded bg-rule/30">
                <div
                  className="h-full bg-good transition-all duration-500"
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

            <div className="flex flex-col justify-center border-b border-rule pb-5 md:col-span-3 md:border-b-0 md:border-r md:pb-0 md:px-6">
              <span className="text-xs uppercase tracking-wider text-muted">Legal Conformance Tiers</span>
              <div className="mt-2.5 flex items-center gap-2 text-xs">
                {[
                  { lvl: 'A', name: 'Baseline' },
                  { lvl: 'AA', name: 'Legal' },
                  { lvl: 'AAA', name: 'Enhanced' },
                ].map(({ lvl, name }) => {
                  const levelScore = currentAudit.scores?.[lvl] ?? (lvl === currentAudit.targetLevel ? currentAudit.score : null);
                  const count = currentAudit.summary?.byWcag?.[lvl] || 0;
                  const isCurrentTarget = lvl === currentAudit.targetLevel;

                  const isPass = (levelScore ?? currentAudit.score) >= 90;
                  const borderClass = isPass ? 'border-good/50 bg-good/5 text-good' : 'border-poor/50 bg-poor/5 text-poor';

                  return (
                    <div
                      key={lvl}
                      className={`flex-1 rounded border p-1.5 text-center ${borderClass} ${
                        isCurrentTarget ? 'ring-1 ring-ink' : ''
                      }`}
                    >
                      <div className="text-[10px] font-semibold uppercase text-muted">{lvl}</div>
                      <div className="mt-0.5 text-sm font-bold num text-ink">
                        {levelScore !== null && levelScore !== undefined ? `${levelScore}%` : count === 0 ? '100%' : `${Math.max(0, 100 - count * 15)}%`}
                      </div>
                      <div className="text-[10px] font-medium">
                        {count === 0 ? '✓ Pass' : `${count} Fail`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col justify-center md:col-span-2 md:pl-4">
              <span className="text-xs uppercase tracking-wider text-muted">Target Page</span>
              <p className="mt-1 text-xs font-medium text-ink">{ago(currentAudit.createdAt)}</p>
              <a
                href={currentAudit.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex items-center gap-1 truncate font-mono text-xs text-accent underline underline-offset-4"
                title={currentAudit.url}
              >
                <span className="truncate">{currentAudit.url.replace(/^https?:\/\//, '')}</span>
              </a>
              {currentAudit.durationMs > 0 && (
                <span className="mt-1 text-xs text-muted num">{currentAudit.durationMs}ms</span>
              )}
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-3">
            <div role="group" aria-label="Audit View Tabs" className="inline-flex rounded border border-rule">
              <button
                type="button"
                onClick={() => setActiveTab('violations')}
                className={`border-r border-rule px-4 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === 'violations' ? 'bg-ink text-paper' : 'bg-transparent text-ink hover:bg-paper'
                }`}
              >
                Violations ({currentAudit.violations?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('passes')}
                className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === 'passes' ? 'bg-ink text-paper' : 'bg-transparent text-ink hover:bg-paper'
                }`}
              >
                Passed Criteria ({currentAudit.passes?.length || currentAudit.summary?.passesCount || 0})
              </button>
            </div>

            {activeTab === 'violations' && currentAudit.violations?.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div role="group" aria-label="Level Filter" className="inline-flex rounded border border-rule text-xs">
                  <button
                    type="button"
                    onClick={() => setLevelFilter('all')}
                    className={`border-r border-rule px-2.5 py-1 ${
                      levelFilter === 'all' ? 'bg-ink text-paper' : 'bg-transparent text-ink hover:bg-paper'
                    }`}
                  >
                    All
                  </button>
                  {['A', 'AA', 'AAA'].map((lvl) => {
                    const count = currentAudit.summary?.byWcag?.[lvl] || 0;
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setLevelFilter(lvl)}
                        className={`border-l border-rule px-2 py-1 first:border-l-0 ${
                          levelFilter === lvl
                            ? 'bg-ink text-paper'
                            : count > 0
                            ? 'text-ink hover:bg-paper'
                            : 'text-muted/60 opacity-50'
                        }`}
                      >
                        Lvl {lvl} ({count})
                      </button>
                    );
                  })}
                </div>

                <div role="group" aria-label="Severity Filter" className="inline-flex rounded border border-rule text-xs">
                  <button
                    type="button"
                    onClick={() => setImpactFilter('all')}
                    className={`border-r border-rule px-2.5 py-1 ${
                      impactFilter === 'all' ? 'bg-ink text-paper' : 'bg-transparent text-ink hover:bg-paper'
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
                        className={`border-l border-rule px-2 py-1 capitalize first:border-l-0 ${
                          impactFilter === imp
                            ? 'bg-ink text-paper'
                            : count > 0
                            ? 'text-ink hover:bg-paper'
                            : 'text-muted/60 opacity-50'
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

          {activeTab === 'violations' && (
            <div>
              {currentAudit.violations?.length === 0 ? (
                <div className="rounded border border-good/40 bg-good/5 p-10 text-center">
                  <p className="font-display text-2xl text-good font-bold">
                    Zero Accessibility Violations!
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    This page fully satisfies all audited WCAG 2.1 Level {currentAudit.targetLevel} criteria.
                  </p>
                </div>
              ) : filteredViolations.length === 0 ? (
                <div className="rounded border border-rule bg-panel p-8 text-center text-xs text-muted">
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
                        className="rounded border border-rule bg-panel"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3 bg-paper">
                          <div className="flex items-center gap-2">
                            <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${impact.badge}`}>
                              {impact.label}
                            </span>

                            <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${wcagLevelStyle}`}>
                              WCAG {violation.wcagLevel}
                            </span>

                            <code className="rounded border border-rule bg-panel px-2 py-0.5 font-mono text-xs font-bold text-ink">
                              {violation.ruleId}
                            </code>
                          </div>

                          {violation.helpUrl && (
                            <a
                              href={violation.helpUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-accent underline underline-offset-4"
                            >
                              W3C Specification
                            </a>
                          )}
                        </div>

                        <div className="p-4 space-y-3">
                          <p className="text-sm text-ink leading-relaxed font-medium">
                            {violation.description}
                          </p>

                          <div className="rounded border border-rule bg-paper p-3 text-xs">
                            <strong className="text-ink">Remediation Guide:</strong>{' '}
                            <span className="text-muted">{violation.help}</span>
                          </div>

                          {violation.nodes?.length > 0 && (
                            <div className="pt-2">
                              <span className="mb-2 block text-xs uppercase tracking-wider text-muted">
                                Failing Elements ({violation.nodes.length})
                              </span>

                              <div className="space-y-2">
                                {violation.nodes.map((node, nodeIdx) => {
                                  const selector = node.target?.join(' ') || 'Element';
                                  const copyKey = `${vIdx}-${nodeIdx}`;

                                  return (
                                    <div
                                      key={nodeIdx}
                                      className="rounded border border-rule bg-paper p-3 text-xs space-y-1.5"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-mono text-xs text-accent font-semibold">
                                          {selector}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => copyToClipboard(node.html, copyKey)}
                                          className="text-xs text-muted hover:text-ink underline underline-offset-2"
                                        >
                                          {copiedIndex === copyKey ? 'Copied' : 'Copy HTML'}
                                        </button>
                                      </div>

                                      <pre className="overflow-x-auto rounded border border-rule bg-panel p-2 font-mono text-xs text-ink">
                                        {node.html}
                                      </pre>

                                      {node.failureSummary && (
                                        <p className="text-xs text-poor font-medium">
                                          {node.failureSummary}
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

          {activeTab === 'passes' && (
            <div className="rounded border border-rule bg-panel p-5">
              <div className="mb-3 flex items-center justify-between border-b border-rule pb-3">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Passed WCAG Criteria ({currentAudit.passes?.length || currentAudit.summary?.passesCount || 0})
                </span>
                <span className="text-xs text-good font-medium">
                  Compliant with evaluated Level {currentAudit.targetLevel} criteria
                </span>
              </div>

              {currentAudit.passes && currentAudit.passes.length > 0 ? (
                <div className="divide-y divide-rule">
                  {currentAudit.passes.map((pass, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-good font-bold">✓</span>
                        <span className="text-ink font-medium">{pass.description}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="rounded border border-rule bg-paper px-2 py-0.5 font-mono text-xs text-muted">
                          {pass.ruleId}
                        </code>
                        <span className="rounded border border-good/40 bg-good/10 px-1.5 py-0.5 text-xs font-semibold text-good">
                          Lvl {pass.wcagLevel}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-muted">
                  {currentAudit.summary?.passesCount || 0} checks passed for Level {currentAudit.targetLevel}. Run an audit to view passing criteria.
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <section className="rounded border border-rule bg-panel p-10 text-center text-muted">
          <h3 className="font-display text-xl text-ink">No WCAG Audits Recorded Yet</h3>
          <p className="mt-1 text-sm text-muted">
            Choose your target standard (Level A, AA, or AAA), enter your website URL, and click <strong>"Run WCAG Audit"</strong>.
          </p>
        </section>
      )}
    </div>
  );
}
