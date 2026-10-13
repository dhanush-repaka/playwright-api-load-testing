import { After } from '@fixtures/index';
import { PerformanceReportWriter, SUMMARY_ATTACHMENT } from '@core/reporting/PerformanceReportWriter';
import { HtmlReportRenderer } from '@core/reporting/HtmlReportRenderer';

/**
 * Publishes the scenario's performance results:
 *  - JSON + HTML files under reports/performance/scenarios
 *  - attachments on the Playwright test (visible in the HTML report and
 *    consumed by PerformanceDashboardReporter for the consolidated view)
 */
After(async ({ loadContext, $testInfo }) => {
  const { summary } = loadContext;
  if (!summary) return;

  PerformanceReportWriter.write(summary);
  await $testInfo.attach(SUMMARY_ATTACHMENT, {
    body: JSON.stringify(summary, null, 2),
    contentType: 'application/json',
  });
  await $testInfo.attach('performance-report.html', {
    body: HtmlReportRenderer.renderDashboard([summary], summary.scenario),
    contentType: 'text/html',
  });
});
