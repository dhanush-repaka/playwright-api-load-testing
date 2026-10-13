import type { LoadTestSummary, SlaMetric, SlaOperator, SlaResult, SlaThreshold } from '@types';

const METRICS: readonly SlaMetric[] = [
  'min',
  'max',
  'mean',
  'median',
  'p90',
  'p95',
  'p99',
  'errorRate',
  'throughput',
  'totalRequests',
];
const OPERATORS: readonly SlaOperator[] = ['<', '<=', '>', '>=', '=='];

const COMPARATORS: Record<SlaOperator, (actual: number, expected: number) => boolean> = {
  '<': (a, e) => a < e,
  '<=': (a, e) => a <= e,
  '>': (a, e) => a > e,
  '>=': (a, e) => a >= e,
  '==': (a, e) => a === e,
};

/**
 * Evaluates Service Level Agreement thresholds against a run summary.
 * Thresholds can target the aggregate or a single operation.
 */
export class SlaValidator {
  static evaluate(summary: LoadTestSummary, thresholds: SlaThreshold[]): SlaResult[] {
    return thresholds.map((threshold) => {
      const actual = SlaValidator.metricValue(summary, threshold);
      return { ...threshold, actual, passed: COMPARATORS[threshold.operator](actual, threshold.value) };
    });
  }

  static describe(result: SlaResult): string {
    const scope = result.operation ? `[${result.operation}] ` : '';
    const unit = SlaValidator.unit(result.metric);
    return `${result.passed ? 'PASS' : 'FAIL'} ${scope}${result.metric} ${result.operator} ${result.value}${unit} (actual: ${result.actual}${unit})`;
  }

  static parse(raw: { metric: string; operator: string; value: string | number; operation?: string }): SlaThreshold {
    const metric = raw.metric.trim() as SlaMetric;
    const operator = raw.operator.trim() as SlaOperator;
    if (!METRICS.includes(metric))
      throw new Error(`Unsupported SLA metric "${raw.metric}". Use: ${METRICS.join(', ')}`);
    if (!OPERATORS.includes(operator)) throw new Error(`Unsupported SLA operator "${raw.operator}"`);
    const numeric = String(raw.value ?? '').replace(/[^\d.]/g, '');
    const value = Number(numeric);
    if (numeric === '' || Number.isNaN(value)) throw new Error(`Invalid SLA value "${raw.value}"`);
    const operation = raw.operation?.trim() || undefined;
    return { metric, operator, value, operation };
  }

  private static metricValue(summary: LoadTestSummary, threshold: SlaThreshold): number {
    const source = threshold.operation ? summary.operations.find((o) => o.operation === threshold.operation) : summary;
    if (!source) throw new Error(`No samples recorded for operation "${threshold.operation}"`);
    switch (threshold.metric) {
      case 'errorRate':
        return source.errorRate;
      case 'throughput':
        return source.throughput;
      case 'totalRequests':
        return source.totalRequests;
      default:
        return source.latency[threshold.metric];
    }
  }

  private static unit(metric: SlaMetric): string {
    if (metric === 'errorRate') return '%';
    if (metric === 'throughput') return ' rps';
    if (metric === 'totalRequests') return '';
    return 'ms';
  }
}
