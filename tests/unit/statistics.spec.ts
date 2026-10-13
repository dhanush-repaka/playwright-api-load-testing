import { expect, test } from '@playwright/test';
import { Statistics } from '@core/metrics/Statistics';

test.describe('Statistics', () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100

  test('nearest-rank percentiles', () => {
    expect(Statistics.percentile(values, 50)).toBe(50);
    expect(Statistics.percentile(values, 95)).toBe(95);
    expect(Statistics.percentile(values, 99)).toBe(99);
    expect(Statistics.percentile(values, 100)).toBe(100);
  });

  test('handles empty input safely', () => {
    expect(Statistics.percentile([], 95)).toBe(0);
    expect(Statistics.latency([])).toMatchObject({ min: 0, max: 0, mean: 0, p95: 0 });
  });

  test('aggregate latency stats', () => {
    const stats = Statistics.latency([30, 10, 20]);
    expect(stats).toMatchObject({ min: 10, max: 30, mean: 20, median: 20 });
    expect(stats.stdDev).toBe(10);
  });
});
