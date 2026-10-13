import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import type { LoadTestSummary } from '../../types';
import { HtmlReportRenderer } from './HtmlReportRenderer';
import { PerformanceReportWriter, SUMMARY_ATTACHMENT } from './PerformanceReportWriter';

/**
 * Playwright reporter that aggregates every scenario's performance summary
 * (attached by the load steps) into one consolidated dashboard at
 * reports/performance/index.html, and prints a console digest.
 *
 * Note: uses relative imports - reporters are loaded before tsconfig path
 * aliases are guaranteed to be resolvable.
 */
export default class PerformanceDashboardReporter implements Reporter {
  private readonly summaries: LoadTestSummary[] = [];

  onTestEnd(_test: TestCase, result: TestResult): void {
    for (const attachment of result.attachments) {
      if (attachment.name !== SUMMARY_ATTACHMENT || !attachment.body) continue;
      this.summaries.push(JSON.parse(attachment.body.toString('utf-8')) as LoadTestSummary);
    }
  }

  onEnd(): void {
    if (!this.summaries.length) return;
    const file = PerformanceReportWriter.writeDashboard(this.summaries);

    const rows = this.summaries.map((s) => ({
      Scenario: s.scenario.length > 48 ? `${s.scenario.slice(0, 45)}...` : s.scenario,
      VUs: s.profile.virtualUsers,
      Requests: s.totalRequests,
      RPS: s.throughput,
      'Err %': s.errorRate,
      'p95 ms': s.latency.p95,
      SLA: HtmlReportRenderer.status(s).toUpperCase(),
    }));
    console.log('\nPerformance summary');
    console.table(rows);
    console.log(`Performance dashboard: ${file}\n`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
