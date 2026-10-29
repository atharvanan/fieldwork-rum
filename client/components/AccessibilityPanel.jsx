'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ago } from '@/lib/format';

const IMPACT_COLORS = {
  critical: 'bg-poor text-white',
  serious: 'bg-poor/20 text-poor border border-poor/40',
  moderate: 'bg-warn/20 text-warn border border-warn/40',
  minor: 'bg-rule text-muted',
};

const WCAG_TAG_COLORS = {
  A: 'border-accent text-accent',
  AA: 'border-good text-good',
  AAA: 'border-purple-600 text-purple-600',
};

export default function AccessibilityPanel({ project }) {
  const queryClient = useQueryClient();
  const defaultUrl = project.domain ? `https://${project.domain}` : 'http://localhost:3000/demo.html';

  const [url, setUrl] = useState(defaultUrl);
  const [targetLevel, setTargetLevel] = useState('AA');
  const [selectedAuditId, setSelectedAuditId] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

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

  return (
    <section aria-labelledby="a11y-heading" className="rounded border border-rule bg-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-5">
        <div>
          <h2 id="a11y-heading" className="text-2xl">
            WCAG Accessibility Assessment
          </h2>
          <p className="mt-1 text-sm text-muted">
            Automated compliance evaluation for WCAG 2.1 Conformance Levels A, AA, and AAA.
          </p>
        </div>
      </div>

      {/* Audit Launch Bar */}
      <form
        className="mt-6 flex flex-wrap items-end gap-3 rounded border border-rule/60 bg-canvas p-4"
        onSubmit={(e) => {
          e.preventDefault();
          runMutation.mutate();
        }}
      >
        <div className="min-w-[240px] flex-1">
          <label className="label text-xs font-semibold uppercase tracking-wider text-muted" htmlFor="audit-url">
            Target Page URL
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

        <div>
          <span className="label text-xs font-semibold uppercase tracking-wider text-muted">WCAG Standard</span>
          <div className="flex rounded border border-rule bg-panel p-0.5">
            {['A', 'AA', 'AAA'].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setTargetLevel(lvl)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  targetLevel === lvl ? 'rounded bg-ink text-white' : 'text-muted hover:text-ink'
                }`}
              >
                Level {lvl}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={runMutation.isPending}
          className="btn-primary flex items-center gap-2 px-5 py-2"
        >
          {runMutation.isPending ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Analyzing DOM...</span>
            </>
          ) : (
            <span>Run WCAG Audit</span>
          )}
        </button>
      </form>

      {runMutation.error && (
        <div role="alert" className="mt-4 rounded border border-poor/40 bg-poor/10 p-3 text-sm text-poor">
          {runMutation.error.message}
        </div>
      )}

      {/* Active Audit Report */}
      {currentAudit ? (
        <div className="mt-8 space-y-6">
          {/* Scorecard Header */}
          <div className="grid gap-4 rounded border border-rule bg-canvas p-5 sm:grid-cols-4">
            <div className="border-b border-rule pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Compliance Score</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={`font-display text-4xl num ${
                    currentAudit.score >= 90
                      ? 'text-good'
                      : currentAudit.score >= 70
                      ? 'text-warn'
                      : 'text-poor'
                  }`}
                >
                  {currentAudit.score}
                </span>
                <span className="text-xs text-muted">/ 100</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Target: <strong>WCAG 2.1 {currentAudit.targetLevel}</strong>
              </p>
            </div>

            <div className="border-b border-rule pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:px-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Violations</span>
              <p className="mt-1 font-display text-3xl num">{currentAudit.summary?.violationsCount || 0}</p>
              <p className="mt-1 text-xs text-muted">{currentAudit.summary?.passesCount || 0} checks passed</p>
            </div>

            <div className="border-b border-rule pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:px-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">By WCAG Level</span>
              <div className="mt-2 flex gap-2 text-xs">
                <span className="rounded border border-rule px-2 py-0.5">
                  A: <strong>{currentAudit.summary?.byWcag?.A || 0}</strong>
                </span>
                <span className="rounded border border-rule px-2 py-0.5">
                  AA: <strong>{currentAudit.summary?.byWcag?.AA || 0}</strong>
                </span>
                <span className="rounded border border-rule px-2 py-0.5">
                  AAA: <strong>{currentAudit.summary?.byWcag?.AAA || 0}</strong>
                </span>
              </div>
            </div>

            <div className="sm:pl-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Audited At</span>
              <p className="mt-1 text-sm font-medium">{ago(currentAudit.createdAt)}</p>
              <p className="mt-1 truncate font-mono text-xs text-muted" title={currentAudit.url}>
                {currentAudit.url}
              </p>
            </div>
          </div>

          {/* Severity Impact Filter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`rounded px-3 py-1 font-medium ${
                  activeFilter === 'all' ? 'bg-ink text-white' : 'border border-rule hover:bg-panel'
                }`}
              >
                All Issues ({currentAudit.violations?.length || 0})
              </button>
              {['critical', 'serious', 'moderate', 'minor'].map((imp) => {
                const count = currentAudit.summary?.byImpact?.[imp] || 0;
                return (
                  <button
                    key={imp}
                    type="button"
                    onClick={() => setActiveFilter(imp)}
                    className={`rounded px-3 py-1 font-medium capitalize transition-colors ${
                      activeFilter === imp
                        ? 'bg-ink text-white'
                        : count > 0
                        ? 'border border-rule hover:bg-panel'
                        : 'border border-rule/40 text-muted opacity-60'
                    }`}
                  >
                    {imp} ({count})
                  </button>
                );
              })}
            </div>

            {audits.length > 1 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted">History:</span>
                <select
                  aria-label="Select past audit"
                  className="rounded border border-rule bg-canvas px-2 py-1 text-xs"
                  value={currentAudit._id}
                  onChange={(e) => setSelectedAuditId(e.target.value)}
                >
                  {audits.map((a) => (
                    <option key={a._id} value={a._id}>
                      {ago(a.createdAt)} - Score: {a.score} ({a.url})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Violations List */}
          {currentAudit.violations?.length === 0 ? (
            <div className="rounded border border-good/40 bg-good/5 p-8 text-center">
              <p className="font-display text-2xl text-good">Zero Accessibility Violations!</p>
              <p className="mt-2 text-sm text-muted">
                This page fully complies with all audited WCAG 2.1 Level {currentAudit.targetLevel} criteria.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentAudit.violations
                ?.filter((v) => activeFilter === 'all' || v.impact === activeFilter)
                .map((violation) => (
                  <div
                    key={violation.ruleId}
                    className="overflow-hidden rounded border border-rule bg-canvas shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-panel px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                            IMPACT_COLORS[violation.impact]
                          }`}
                        >
                          {violation.impact}
                        </span>
                        <span
                          className={`rounded border px-2 py-0.5 text-xs font-semibold ${
                            WCAG_TAG_COLORS[violation.wcagLevel] || 'border-rule'
                          }`}
                        >
                          WCAG {violation.wcagLevel}
                        </span>
                        <span className="font-mono text-sm font-semibold">{violation.ruleId}</span>
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
                      <p className="text-sm font-medium">{violation.description}</p>
                      <div className="rounded bg-panel/70 p-3 text-xs">
                        <strong className="text-ink">Remediation:</strong>{' '}
                        <span className="text-muted">{violation.help}</span>
                      </div>

                      {/* Problematic DOM Nodes */}
                      {violation.nodes?.length > 0 && (
                        <div className="space-y-2 pt-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                            Failing Elements ({violation.nodes.length})
                          </span>
                          <div className="max-h-48 space-y-2 overflow-y-auto">
                            {violation.nodes.map((node, i) => (
                              <div key={i} className="rounded border border-rule/60 bg-panel p-2.5 text-xs">
                                {node.target?.length > 0 && (
                                  <div className="mb-1 font-mono text-[11px] text-accent">
                                    Selector: {node.target.join(' ')}
                                  </div>
                                )}
                                <pre className="overflow-x-auto rounded bg-ink/5 p-1.5 font-mono text-[11px] text-ink">
                                  {node.html}
                                </pre>
                                {node.failureSummary && (
                                  <p className="mt-1 text-poor text-[11px]">{node.failureSummary}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded border border-rule/70 bg-canvas p-8 text-center text-muted">
          <p className="text-base font-medium text-ink">No accessibility audits recorded yet</p>
          <p className="mt-1 text-sm">
            Enter your site URL above and click <strong>"Run WCAG Audit"</strong> to evaluate Level A, AA, and AAA
            compliance.
          </p>
        </div>
      )}
    </section>
  );
}

