import type { LatencyStats } from '@types';

/** Pure, side-effect-free statistical helpers (easy to unit test). */
export const Statistics = {
  /** Nearest-rank percentile on a pre-sorted ascending array. */
  percentile(sorted: readonly number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (p <= 0) return sorted[0];
    if (p >= 100) return sorted[sorted.length - 1];
    const rank = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
  },

  mean(values: readonly number[]): number {
    return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
  },

  stdDev(values: readonly number[]): number {
    if (values.length < 2) return 0;
    const avg = Statistics.mean(values);
    const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
  },

  latency(values: readonly number[]): LatencyStats {
    const sorted = [...values].sort((a, b) => a - b);
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      min: round(sorted[0] ?? 0),
      max: round(sorted[sorted.length - 1] ?? 0),
      mean: round(Statistics.mean(sorted)),
      median: round(Statistics.percentile(sorted, 50)),
      p90: round(Statistics.percentile(sorted, 90)),
      p95: round(Statistics.percentile(sorted, 95)),
      p99: round(Statistics.percentile(sorted, 99)),
      stdDev: round(Statistics.stdDev(sorted)),
    };
  },
};
