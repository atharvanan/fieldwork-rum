function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeFilename(url) {
  if (!url) return 'audit-report';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
  } catch {
    return url.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 30);
  }
}

export function generateReportHtml(audit, { isWord = false } = {}) {
  const url = audit?.url || 'Unknown URL';
  const score = audit?.score ?? 0;
  const scoreColor = score >= 90 ? '#1F8A5B' : score >= 50 ? '#B98100' : '#C23B22';
  const scoreLabel = score >= 90 ? 'Fast & Optimized' : score >= 50 ? 'Needs Improvement' : 'Poor Performance';
  const strategy = (audit?.strategy || 'mobile').toUpperCase();
  const dateStr = audit?.createdAt ? new Date(audit.createdAt).toLocaleString() : new Date().toLocaleString();
  const statusCode = audit?.statusCode || 200;
  const durationMs = audit?.durationMs || 0;

  const vitals = [
    { key: 'LCP', label: 'Largest Contentful Paint', limit: 'Good <= 2.50 s' },
    { key: 'FCP', label: 'First Contentful Paint', limit: 'Good <= 1.80 s' },
    { key: 'CLS', label: 'Cumulative Layout Shift', limit: 'Good <= 0.100' },
    { key: 'TBT', label: 'Total Blocking Time', limit: 'Good <= 200 ms' },
    { key: 'TTFB', label: 'Time to First Byte', limit: 'Good <= 800 ms' },
    { key: 'SpeedIndex', label: 'Speed Index', limit: 'Good <= 3.40 s' },
  ];

  const metrics = audit?.metrics || {};
  const opportunities = audit?.opportunities || [];

  const impactColors = {
    critical: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
    serious: { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
    moderate: { bg: '#E0F2FE', text: '#075985', border: '#7DD3FC' },
    minor: { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' },
  };

  const ratingColors = {
    good: { bg: '#DCFCE7', text: '#166534', border: '#86EFAC' },
    'needs-improvement': { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
    poor: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
  };

  const headerPrefix = isWord
    ? `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>Performance Audit Report - ${escapeHtml(url)}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->`
    : `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Performance Audit Report - ${escapeHtml(url)}</title>`;

  return `${headerPrefix}
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #12303B;
      background: #FAFAF7;
      margin: 0;
      padding: 0;
      line-height: 1.5;
    }
    .toolbar {
      background: #12303B;
      color: #FFFFFF;
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .toolbar button {
      background: #2B5D6E;
      color: #FFFFFF;
      border: 1px solid rgba(255,255,255,0.2);
      padding: 6px 14px;
      font-size: 13px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      margin-left: 8px;
    }
    .toolbar button:hover {
      background: #1F4552;
    }
    .container {
      max-width: 960px;
      margin: 24px auto;
      padding: 0 20px;
    }
    .card {
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .header-card {
      border-top: 5px solid ${scoreColor};
    }
    .score-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: ${scoreColor};
      color: #FFFFFF;
      font-size: 32px;
      font-weight: bold;
      margin-right: 20px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .grid-6 {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 12px;
    }
    .stat-box {
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 4px;
      padding: 12px;
      text-align: center;
    }
    .stat-label {
      font-size: 10px;
      text-transform: uppercase;
      color: #6B7280;
      margin-bottom: 4px;
      letter-spacing: 0.5px;
    }
    .stat-val {
      font-size: 18px;
      font-weight: bold;
      color: #12303B;
    }
    .vital-box {
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      padding: 14px;
    }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .opportunity-card {
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      margin-bottom: 16px;
      overflow: hidden;
      background: #FFFFFF;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .opp-header {
      padding: 14px 18px;
      background: #F9FAFB;
      border-bottom: 1px solid #E5E7EB;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .opp-body {
      padding: 18px;
    }
    .fix-box {
      background: #F0F9FF;
      border: 1px solid #BAE6FD;
      border-radius: 4px;
      padding: 14px;
      margin-top: 14px;
      font-size: 12px;
      color: #0369A1;
    }
    .fix-title {
      font-weight: bold;
      text-transform: uppercase;
      font-size: 11px;
      margin-bottom: 4px;
      letter-spacing: 0.5px;
    }
    .culprit-item {
      background: #FAFAFA;
      border: 1px solid #E5E7EB;
      border-radius: 4px;
      padding: 10px 12px;
      margin-top: 10px;
      font-size: 12px;
    }
    .code-snippet {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      background: #12303B;
      color: #E2E8F0;
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      margin-top: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid #E5E7EB;
      font-size: 13px;
    }
    th {
      background: #F9FAFB;
      font-size: 11px;
      text-transform: uppercase;
      color: #6B7280;
    }
    @media print {
      body {
        background: #FFFFFF !important;
        font-size: 12pt;
      }
      .no-print, .toolbar {
        display: none !important;
      }
      .container {
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .card, .opportunity-card {
        box-shadow: none !important;
        border: 1px solid #CCC !important;
      }
      .page-break {
        page-break-before: always;
      }
      .avoid-break {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  ${
    !isWord
      ? `<div class="toolbar no-print">
    <div style="font-size: 14px; font-weight: bold;">
      Fieldwork • Instant Performance Audit Report
    </div>
    <div>
      <button onclick="window.print()">Print / Save as PDF</button>
      <button onclick="window.close()">Close</button>
    </div>
  </div>`
      : ''
  }

  <div class="container">
    <!-- Header Card -->
    <div class="card header-card">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center;">
          <div class="score-badge">${score}</div>
          <div>
            <div style="font-size: 22px; font-weight: bold; color: #12303B;">${scoreLabel}</div>
            <div style="font-size: 13px; color: #6B7280; margin-top: 2px;">
              Simulation: <strong>${strategy}</strong> • HTTP Status: <strong>${statusCode}</strong> • Latency: <strong>${durationMs} ms</strong>
            </div>
            <div style="font-size: 12px; color: #9CA3AF; margin-top: 2px;">
              Report generated on ${dateStr}
            </div>
          </div>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 11px; font-weight: bold; color: #6B7280; text-transform: uppercase; letter-spacing: 1px;">Target Web Application</span>
          <div style="font-family: monospace; font-size: 14px; font-weight: 600; color: #2B5D6E; margin-top: 4px; word-break: break-all;">
            ${escapeHtml(url)}
          </div>
        </div>
      </div>
    </div>

    <!-- Payload & Resource Breakdown -->
    <div class="card">
      <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px; color: #12303B;">
        Page Weight & Asset Summary
      </h3>
      <div class="grid-6">
        <div class="stat-box">
          <div class="stat-label">HTML Size</div>
          <div class="stat-val">${Math.round((metrics.htmlBytes || 0) / 1024)} KB</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Blocking</div>
          <div class="stat-val" style="color: ${(metrics.renderBlockingCount || 0) > 0 ? '#C23B22' : '#12303B'};">
            ${metrics.renderBlockingCount || 0}
          </div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Scripts</div>
          <div class="stat-val">${metrics.scriptsCount || 0}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Stylesheets</div>
          <div class="stat-val">${metrics.stylesheetsCount || 0}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Images</div>
          <div class="stat-val">${metrics.imagesCount || 0}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Third-Party</div>
          <div class="stat-val">${metrics.thirdPartyCount || 0}</div>
        </div>
      </div>
    </div>

    <!-- Core Web Vitals Lab Benchmarks -->
    <div class="card">
      <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 15px; text-transform: uppercase; letter-spacing: 0.5px; color: #12303B;">
        Core Web Vitals (Simulated Lab)
      </h3>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Description</th>
            <th>Measured Value</th>
            <th>Rating</th>
            <th>Google Recommendation</th>
          </tr>
        </thead>
        <tbody>
          ${vitals
            .map((v) => {
              const metric = audit?.vitals?.[v.key];
              if (!metric) return '';
              const rStyle = ratingColors[metric.rating] || ratingColors.good;
              return `<tr>
                <td><strong>${v.key}</strong></td>
                <td style="color: #4B5563;">${v.label}</td>
                <td><strong style="font-size: 14px;">${escapeHtml(metric.display)}</strong></td>
                <td>
                  <span class="pill" style="background: ${rStyle.bg}; color: ${rStyle.text}; border: 1px solid ${rStyle.border};">
                    ${escapeHtml(metric.rating)}
                  </span>
                </td>
                <td style="color: #6B7280; font-size: 12px;">${v.limit}</td>
              </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    </div>

    <!-- Opportunities & Culprits Section -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px; color: #12303B;">
          Optimization Opportunities & Technical Fixes (${opportunities.length})
        </h3>
        <span style="font-size: 12px; color: #6B7280;">Actionable steps to reach 90+ performance score</span>
      </div>

      ${
        opportunities.length === 0
          ? '<p style="text-align: center; color: #166534; padding: 24px;">No critical or moderate optimization opportunities found. Excellent build!</p>'
          : opportunities
              .map((opp, idx) => {
                const impStyle = impactColors[opp.impact] || impactColors.minor;
                const items = opp.items || [];
                return `<div class="opportunity-card avoid-break">
                  <div class="opp-header">
                    <div>
                      <span class="pill" style="background: ${impStyle.bg}; color: ${impStyle.text}; border: 1px solid ${impStyle.border}; margin-right: 8px;">
                        ${escapeHtml(opp.impact)}
                      </span>
                      <strong style="font-size: 14px; color: #12303B;">${idx + 1}. ${escapeHtml(opp.title)}</strong>
                    </div>
                    ${
                      opp.savings
                        ? `<span class="pill" style="background: #F3F4F6; color: #12303B; border: 1px solid #D1D5DB; font-family: monospace;">
                            Savings: ${escapeHtml(opp.savings)}
                          </span>`
                        : ''
                    }
                  </div>
                  <div class="opp-body">
                    <p style="margin: 0; font-size: 13px; color: #4B5563; line-height: 1.5;">
                      ${escapeHtml(opp.description)}
                    </p>

                    ${
                      opp.fixGuidance
                        ? `<div class="fix-box">
                            <div class="fix-title">Remediation Guidance & Technical Code Fix</div>
                            <div>${escapeHtml(opp.fixGuidance)}</div>
                          </div>`
                        : ''
                    }

                    ${
                      items.length > 0
                        ? `<div style="margin-top: 14px;">
                            <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: #6B7280; letter-spacing: 0.5px; margin-bottom: 6px;">
                              Identified Culprit Assets (${items.length})
                            </div>
                            ${items
                              .map(
                                (item, iIdx) => `<div class="culprit-item">
                                  <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <div style="font-family: monospace; font-size: 11px; color: #2B5D6E; word-break: break-all; font-weight: 600;">
                                      ${iIdx + 1}. ${escapeHtml(item.url || 'HTML Element')}
                                    </div>
                                  </div>
                                  ${
                                    item.detail
                                      ? `<div style="font-size: 12px; color: #B45309; margin-top: 4px; font-weight: 500;">
                                          • ${escapeHtml(item.detail)}
                                        </div>`
                                      : ''
                                  }
                                  ${
                                    item.snippet
                                      ? `<div class="code-snippet">${escapeHtml(item.snippet)}</div>`
                                      : ''
                                  }
                                </div>`
                              )
                              .join('')}
                          </div>`
                        : ''
                    }
                  </div>
                </div>`;
              })
              .join('')
      }
    </div>

    <!-- Footer Note -->
    <div style="text-align: center; color: #9CA3AF; font-size: 11px; padding: 16px 0 32px 0;">
      Fieldwork Performance Auditor • Evaluated against W3C & Lighthouse 10 Core Web Vitals specifications.
    </div>
  </div>
</body>
</html>`;
}

export function exportToPdf(audit) {
  if (!audit) return;
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to view and print the Performance Audit Report.');
    return;
  }
  const html = generateReportHtml(audit, { isWord: false });
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    try {
      printWindow.print();
    } catch {
      // User can still click Print button in toolbar
    }
  }, 400);
}

export function exportToWord(audit) {
  if (!audit) return;
  const html = generateReportHtml(audit, { isWord: true });
  const filename = `performance-audit-${sanitizeFilename(audit.url)}.doc`;
  const blob = new Blob(['\ufeff', html], {
    type: 'application/msword;charset=utf-8',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export function exportToHtml(audit) {
  if (!audit) return;
  const html = generateReportHtml(audit, { isWord: false });
  const filename = `performance-audit-${sanitizeFilename(audit.url)}.html`;
  const blob = new Blob([html], {
    type: 'text/html;charset=utf-8',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
