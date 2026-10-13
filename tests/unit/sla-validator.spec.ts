import { expect, test } from '@playwright/test';
import { SlaValidator } from '@core/assertions/SlaValidator';
import type { LoadTestSummary } from '@types';

const latency = { min: 5, max: 900, mean: 80, median: 60, p90: 200, p95: 300, p99: 700, stdDev: 40 };
const summary = {
  errorRate: 0.5,
  throughput: 120,
  totalRequests: 5000,
  latency,
  operations: [
    { operation: 'users.list', errorRate: 0, throughput: 80, totalRequests: 4000, failedRequests: 0, latency },
    {
      operation: 'orders.create',
      errorRate: 2,
      throughput: 40,
      totalRequests: 1000,
      failedRequests: 20,
      latency: { ...latency, p95: 950 },
    },
  ],
} as unknown as LoadTestSummary;

test.describe('SlaValidator', () => {
  test('evaluates aggregate thresholds', () => {
    const [p95, errors, rps] = SlaValidator.evaluate(summary, [
      { metric: 'p95', operator: '<', value: 500 },
      { metric: 'errorRate', operator: '<=', value: 1 },
      { metric: 'throughput', operator: '>=', value: 200 },
    ]);
    expect(p95).toMatchObject({ actual: 300, passed: true });
    expect(errors).toMatchObject({ actual: 0.5, passed: true });
    expect(rps).toMatchObject({ actual: 120, passed: false });
  });

  test('evaluates operation-scoped thresholds', () => {
    const [result] = SlaValidator.evaluate(summary, [
      { metric: 'p95', operator: '<', value: 800, operation: 'orders.create' },
    ]);
    expect(result).toMatchObject({ actual: 950, passed: false });
  });

  test('parses Gherkin table rows and rejects unknown metrics', () => {
    expect(SlaValidator.parse({ metric: ' p99 ', operator: '<', value: '1200ms', operation: '' })).toEqual({
      metric: 'p99',
      operator: '<',
      value: 1200,
      operation: undefined,
    });
    expect(() => SlaValidator.parse({ metric: 'p42', operator: '<', value: 1 })).toThrow(/Unsupported SLA metric/);
    expect(() => SlaValidator.parse({ metric: 'p95', operator: '<', value: '' })).toThrow(/Invalid SLA value/);
  });
});
