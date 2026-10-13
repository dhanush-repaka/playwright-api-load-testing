import type { LoadTestSummary, TimelineBucket } from '../../types';

const esc = (value: unknown): string =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/**
 * Renders self-contained HTML performance reports (no external assets, so
 * they can be archived as CI artefacts or e-mailed as-is).
 */
export class HtmlReportRenderer {
  static renderDashboard(summaries: LoadTestSummary[], title = 'API Performance Report'): string {
    const passed = summaries.filter((s) => HtmlReportRenderer.status(s) === 'pass').length;
    const generated = new Date().toISOString();
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${HtmlReportRenderer.css()}</style></head>
<body><main>
<header>
  <div><h1>${esc(title)}</h1><p class="muted">Generated ${esc(generated)} · ${summaries.length} scenario(s) · environment: ${esc(summaries[0]?.environment ?? 'n/a')}</p></div>
  <div class="verdict ${passed === summaries.length ? 'pass' : 'fail'}">${passed}/${summaries.length} scenarios met SLA</div>
</header>
<section class="card"><h2>Overview</h2><div class="table-wrap"><table>
<thead><tr><th>Scenario</th><th>Profile</th><th>VUs</th><th class="num">Requests</th><th class="num">RPS</th><th class="num">Error %</th><th class="num">p50</th><th class="num">p95</th><th class="num">p99</th><th>SLA</th></tr></thead>
<tbody>${summaries
      .map(
        (
          s,
          i,
        ) => `<tr><td><a href="#s${i}">${esc(s.scenario)}</a></td><td>${esc(s.profile.name)}</td><td>${s.profile.virtualUsers}</td>
<td class="num">${fmt(s.totalRequests)}</td><td class="num">${fmt(s.throughput, 1)}</td><td class="num">${fmt(s.errorRate, 2)}</td>
<td class="num">${fmt(s.latency.median)}ms</td><td class="num">${fmt(s.latency.p95)}ms</td><td class="num">${fmt(s.latency.p99)}ms</td>
<td>${HtmlReportRenderer.badge(s)}</td></tr>`,
      )
      .join('')}</tbody></table></div></section>
${summaries.map((s, i) => HtmlReportRenderer.scenarioSection(s, i)).join('\n')}
</main></body></html>`;
  }

  private static scenarioSection(s: LoadTestSummary, index: number): string {
    const kpis: [string, string][] = [
      ['Requests', fmt(s.totalRequests)],
      ['Throughput', `${fmt(s.throughput, 1)} rps`],
      ['Error rate', `${fmt(s.errorRate, 2)}%`],
      ['p95 latency', `${fmt(s.latency.p95)} ms`],
      ['Duration', `${fmt(s.elapsedMs / 1000, 1)} s`],
      ['Data received', `${fmt(s.bytesReceived / 1024, 1)} KB`],
    ];
    return `<section class="card" id="s${index}">
<div class="section-head"><h2>${esc(s.scenario)}</h2>${HtmlReportRenderer.badge(s)}</div>
<p class="muted">Profile <b>${esc(s.profile.name)}</b> · ${s.profile.virtualUsers} VUs · ramp-up ${fmt(s.profile.rampUpMs / 1000, 1)}s ·
${s.profile.iterationsPerUser ? `${s.profile.iterationsPerUser} iterations/VU` : `duration ${fmt(s.profile.durationMs / 1000, 1)}s`} · think time ${s.profile.thinkTimeMs}ms</p>
<div class="kpis">${kpis.map(([k, v]) => `<div class="kpi"><span>${k}</span><b>${v}</b></div>`).join('')}</div>
<div class="charts">
  <figure><figcaption>Throughput (req/s) &amp; active users</figcaption>${HtmlReportRenderer.chart(s.timeline, 'requests', 'activeUsers')}</figure>
  <figure><figcaption>Average latency (ms) per second</figcaption>${HtmlReportRenderer.chart(s.timeline, 'avgLatencyMs')}</figure>
</div>
${
  s.thresholds?.length
    ? `<h3>SLA thresholds</h3><div class="table-wrap"><table><thead><tr><th>Scope</th><th>Metric</th><th>Expected</th><th class="num">Actual</th><th>Result</th></tr></thead><tbody>
${s.thresholds.map((t) => `<tr><td>${esc(t.operation ?? 'all')}</td><td>${t.metric}</td><td>${esc(t.operator)} ${t.value}</td><td class="num">${t.actual}</td><td><span class="pill ${t.passed ? 'pass' : 'fail'}">${t.passed ? 'PASS' : 'FAIL'}</span></td></tr>`).join('')}
</tbody></table></div>`
    : ''
}
<h3>Per-operation breakdown</h3><div class="table-wrap"><table>
<thead><tr><th>Operation</th><th class="num">Requests</th><th class="num">RPS</th><th class="num">Error %</th><th class="num">min</th><th class="num">mean</th><th class="num">p50</th><th class="num">p90</th><th class="num">p95</th><th class="num">p99</th><th class="num">max</th></tr></thead>
<tbody>${s.operations
      .map(
        (
          o,
        ) => `<tr><td>${esc(o.operation)}</td><td class="num">${fmt(o.totalRequests)}</td><td class="num">${fmt(o.throughput, 1)}</td><td class="num">${fmt(o.errorRate, 2)}</td>
<td class="num">${fmt(o.latency.min)}</td><td class="num">${fmt(o.latency.mean)}</td><td class="num">${fmt(o.latency.median)}</td><td class="num">${fmt(o.latency.p90)}</td>
<td class="num">${fmt(o.latency.p95)}</td><td class="num">${fmt(o.latency.p99)}</td><td class="num">${fmt(o.latency.max)}</td></tr>`,
      )
      .join('')}</tbody></table></div>
<div class="split">
  <div><h3>Status codes</h3><table><tbody>${Object.entries(s.statusCodes)
    .map(([code, count]) => `<tr><td>${esc(code)}</td><td class="num">${fmt(count)}</td></tr>`)
    .join('')}</tbody></table></div>
  <div><h3>Top errors</h3>${
    Object.keys(s.errors).length
      ? `<table><tbody>${Object.entries(s.errors)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([e, c]) => `<tr><td>${esc(e)}</td><td class="num">${fmt(c)}</td></tr>`)
          .join('')}</tbody></table>`
      : '<p class="muted">No errors recorded.</p>'
  }</div>
</div>
</section>`;
  }

  /** Lightweight inline SVG line chart; optional secondary series drawn dashed on its own scale. */
  private static chart(
    timeline: TimelineBucket[],
    primary: keyof TimelineBucket,
    secondary?: keyof TimelineBucket,
  ): string {
    if (timeline.length < 2) return '<p class="muted">Not enough data points.</p>';
    const w = 600;
    const h = 180;
    const pad = 28;
    const path = (key: keyof TimelineBucket) => {
      const values = timeline.map((b) => Number(b[key]));
      const max = Math.max(...values, 1);
      return {
        max,
        d: values
          .map((v, i) => {
            const x = pad + (i / (values.length - 1)) * (w - pad * 2);
            const y = h - pad - (v / max) * (h - pad * 2);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' '),
      };
    };
    const p = path(primary);
    const s = secondary ? path(secondary) : undefined;
    return `<svg viewBox="0 0 ${w} ${h}" role="img" preserveAspectRatio="none">
<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" class="axis"/>
<line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" class="axis"/>
<text x="${pad + 4}" y="${pad - 8}" class="label">max ${fmt(p.max, 0)}</text>
<text x="${w - pad}" y="${h - 8}" class="label" text-anchor="end">${timeline.length - 1}s</text>
<path d="${p.d}" class="line primary"/>
${s ? `<path d="${s.d}" class="line secondary"/><text x="${w - pad}" y="${pad - 8}" class="label" text-anchor="end">users max ${fmt(s.max)}</text>` : ''}
</svg>`;
  }

  static status(s: LoadTestSummary): 'pass' | 'fail' | 'none' {
    if (!s.thresholds?.length) return 'none';
    return s.thresholds.every((t) => t.passed) ? 'pass' : 'fail';
  }

  private static badge(s: LoadTestSummary): string {
    const status = HtmlReportRenderer.status(s);
    const label = status === 'pass' ? 'SLA MET' : status === 'fail' ? 'SLA BREACHED' : 'NO SLA';
    return `<span class="pill ${status}">${label}</span>`;
  }

  private static css(): string {
    return `
:root{--bg:#f6f7f9;--card:#fff;--text:#1b1f24;--muted:#5d6670;--border:#e3e6ea;--accent:#2f6fde;--accent2:#c2780a;--pass:#1f8a4c;--pass-bg:#e5f5ec;--fail:#c0392b;--fail-bg:#fbe9e7;--none-bg:#eceff2}
@media (prefers-color-scheme:dark){:root{--bg:#0f1216;--card:#171b21;--text:#e6e9ed;--muted:#98a2ad;--border:#2a3038;--accent:#6ea0ff;--accent2:#f0a64a;--pass:#4cc38a;--pass-bg:#16301f;--fail:#ff7b6b;--fail-bg:#3a1c18;--none-bg:#232a32}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 48px}
header{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;margin-bottom:20px}
h1{font-size:22px;margin:0}h2{font-size:17px;margin:0}h3{font-size:14px;margin:20px 0 8px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.muted{color:var(--muted);margin:4px 0}.card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:18px}
.section-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.verdict{padding:8px 14px;border-radius:8px;font-weight:600}.verdict.pass{background:var(--pass-bg);color:var(--pass)}.verdict.fail{background:var(--fail-bg);color:var(--fail)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:14px 0}
.kpi{border:1px solid var(--border);border-radius:8px;padding:10px 12px}.kpi span{display:block;color:var(--muted);font-size:12px}.kpi b{font-size:18px;font-variant-numeric:tabular-nums}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px}figure{margin:0;border:1px solid var(--border);border-radius:8px;padding:10px}
figcaption{font-size:12px;color:var(--muted);margin-bottom:6px}svg{width:100%;height:180px}
.axis{stroke:var(--border)}.line{fill:none;stroke-width:2;vector-effect:non-scaling-stroke}.primary{stroke:var(--accent)}.secondary{stroke:var(--accent2);stroke-dasharray:5 4}
.label{fill:var(--muted);font-size:11px}
.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--border);white-space:nowrap}th{font-size:12px;color:var(--muted);font-weight:600}
td.num,th.num{text-align:right}a{color:var(--accent);text-decoration:none}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.03em}
.pill.pass{background:var(--pass-bg);color:var(--pass)}.pill.fail{background:var(--fail-bg);color:var(--fail)}.pill.none{background:var(--none-bg);color:var(--muted)}
.split{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px}.split td{white-space:normal}`;
  }
}
