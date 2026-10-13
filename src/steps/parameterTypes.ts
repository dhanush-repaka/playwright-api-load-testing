import { defineParameterType } from 'playwright-bdd';
import { DURATION_PATTERN, parseDuration } from '@utils/duration';

/**
 * Custom Cucumber parameter types make Gherkin read naturally while giving
 * steps strongly-typed arguments:
 *   "for 30s" / "over 2 minutes" / "of 250ms" -> number (milliseconds)
 */
defineParameterType({
  name: 'duration',
  regexp: DURATION_PATTERN,
  transformer: (value: string) => parseDuration(value),
});

/** Latency percentile / statistic names usable in assertions. */
defineParameterType({
  name: 'latencyMetric',
  regexp: /min|max|mean|median|p90|p95|p99/,
  transformer: (value: string) => value,
});
