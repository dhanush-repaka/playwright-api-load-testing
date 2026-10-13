import { expect } from '@playwright/test';
import type { DataTable } from 'playwright-bdd';
import type { SlaThreshold } from '@types';
import type { LoadTestContext } from '@fixtures/LoadTestContext';
import { SlaValidator } from '@core/assertions/SlaValidator';
import { Then } from '@fixtures/index';

/**
 * Evaluates thresholds, records them on the summary (for reporting) and
 * asserts softly so every SLA in a scenario is evaluated and reported,
 * not just the first one that fails.
 */
function assertSla(loadContext: LoadTestContext, thresholds: SlaThreshold[]): void {
  const summary = loadContext.requireSummary;
  const results = SlaValidator.evaluate(summary, thresholds);
  summary.thresholds = [...(summary.thresholds ?? []), ...results];
  for (const result of results) {
    expect.soft(result.passed, SlaValidator.describe(result)).toBe(true);
  }
}

Then('the error rate should be at most {float}%', async ({ loadContext }, value: number) => {
  assertSla(loadContext, [{ metric: 'errorRate', operator: '<=', value }]);
});

Then(
  'the {latencyMetric} response time should be below {int} ms',
  async ({ loadContext }, metric: SlaThreshold['metric'], value: number) => {
    assertSla(loadContext, [{ metric, operator: '<', value }]);
  },
);

Then(
  'the {string} {latencyMetric} response time should be below {int} ms',
  async ({ loadContext }, operation: string, metric: SlaThreshold['metric'], value: number) => {
    assertSla(loadContext, [{ metric, operator: '<', value, operation }]);
  },
);

Then('the throughput should be at least {float} requests per second', async ({ loadContext }, value: number) => {
  assertSla(loadContext, [{ metric: 'throughput', operator: '>=', value }]);
});

Then('at least {int} requests should have been sent', async ({ loadContext }, value: number) => {
  assertSla(loadContext, [{ metric: 'totalRequests', operator: '>=', value }]);
});

/**
 * | metric    | operator | value | operation   |
 * | p95       | <        | 500   |             |
 * | errorRate | <=       | 1     | users.create|
 */
Then('the following SLA thresholds should be met:', async ({ loadContext }, table: DataTable) => {
  const thresholds = table
    .hashes()
    .map((row) =>
      SlaValidator.parse({ metric: row.metric, operator: row.operator, value: row.value, operation: row.operation }),
    );
  assertSla(loadContext, thresholds);
});

Then('the environment SLA thresholds should be met', async ({ loadContext }) => {
  assertSla(loadContext, loadContext.effectiveThresholds);
});
