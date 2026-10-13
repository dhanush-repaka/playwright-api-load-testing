import fs from 'node:fs';
import path from 'node:path';
import type { LoadTestSummary } from '../../types';
import { HtmlReportRenderer } from './HtmlReportRenderer';

export const PERFORMANCE_REPORT_DIR = path.resolve(__dirname, '../../../reports/performance');
export const SUMMARY_ATTACHMENT = 'performance-summary.json';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

/** Persists per-scenario JSON + HTML reports to reports/performance. */
export class PerformanceReportWriter {
  static write(summary: LoadTestSummary, outputDir = PERFORMANCE_REPORT_DIR): { json: string; html: string } {
    const dir = path.join(outputDir, 'scenarios');
    fs.mkdirSync(dir, { recursive: true });
    const base = path.join(dir, slugify(summary.scenario));
    const json = `${base}.json`;
    const html = `${base}.html`;
    fs.writeFileSync(json, JSON.stringify(summary, null, 2));
    fs.writeFileSync(html, HtmlReportRenderer.renderDashboard([summary], summary.scenario));
    return { json, html };
  }

  static writeDashboard(summaries: LoadTestSummary[], outputDir = PERFORMANCE_REPORT_DIR): string {
    fs.mkdirSync(outputDir, { recursive: true });
    const file = path.join(outputDir, 'index.html');
    fs.writeFileSync(file, HtmlReportRenderer.renderDashboard(summaries));
    fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify(summaries, null, 2));
    return file;
  }
}
