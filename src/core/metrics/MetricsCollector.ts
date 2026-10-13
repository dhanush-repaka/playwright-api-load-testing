import type { LoadProfile, LoadTestSummary, OperationSummary, RequestSample, TimelineBucket } from '@types';
import { Statistics } from './Statistics';

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * Collects raw request samples during a run and aggregates them into a
 * LoadTestSummary. Raw samples are kept in memory, which is appropriate for
 * POC-scale runs; for very long soak tests swap in a streaming/HDR histogram
 * implementation behind the same interface.
 */
export class MetricsCollector {
  private readonly samples: RequestSample[] = [];
  private readonly activeUsersBySecond = new Map<number, number>();
  private startedAt = 0;
  private finishedAt = 0;
  private activeUsers = 0;
  private failedCount = 0;

  start(): void {
    this.startedAt = Date.now();
  }

  stop(): void {
    this.finishedAt = Date.now();
  }

  record(sample: RequestSample): void {
    this.samples.push(sample);
    if (!sample.success) this.failedCount += 1;
    this.trackActiveUsers(sample.startedAt);
  }

  userStarted(): void {
    this.activeUsers += 1;
    this.trackActiveUsers(Date.now());
  }

  userStopped(): void {
    this.activeUsers -= 1;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  /** Running error rate (%) - O(1), safe to poll during a run. */
  get errorRate(): number {
    return this.samples.length ? round((this.failedCount / this.samples.length) * 100) : 0;
  }

  summarize(scenario: string, profile: LoadProfile, environment: string): LoadTestSummary {
    const elapsedMs = Math.max((this.finishedAt || Date.now()) - this.startedAt, 1);
    const failed = this.samples.filter((s) => !s.success);
    const statusCodes: Record<string, number> = {};
    const errors: Record<string, number> = {};

    for (const sample of this.samples) {
      const code = sample.status === 0 ? 'NETWORK_ERROR' : String(sample.status);
      statusCodes[code] = (statusCodes[code] ?? 0) + 1;
      if (sample.error) errors[sample.error] = (errors[sample.error] ?? 0) + 1;
    }

    return {
      scenario,
      profile,
      environment,
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: new Date(this.finishedAt || Date.now()).toISOString(),
      elapsedMs,
      totalRequests: this.samples.length,
      successfulRequests: this.samples.length - failed.length,
      failedRequests: failed.length,
      errorRate: this.samples.length ? round((failed.length / this.samples.length) * 100) : 0,
      throughput: round(this.samples.length / (elapsedMs / 1000)),
      bytesReceived: this.samples.reduce((sum, s) => sum + s.sizeBytes, 0),
      latency: Statistics.latency(this.samples.map((s) => s.durationMs)),
      statusCodes,
      errors,
      operations: this.summarizeOperations(elapsedMs),
      timeline: this.buildTimeline(),
    };
  }

  private summarizeOperations(elapsedMs: number): OperationSummary[] {
    const byOperation = new Map<string, RequestSample[]>();
    for (const sample of this.samples) {
      const list = byOperation.get(sample.operation) ?? [];
      list.push(sample);
      byOperation.set(sample.operation, list);
    }
    return [...byOperation.entries()]
      .map(([operation, samples]) => {
        const failedCount = samples.filter((s) => !s.success).length;
        return {
          operation,
          totalRequests: samples.length,
          failedRequests: failedCount,
          errorRate: round((failedCount / samples.length) * 100),
          throughput: round(samples.length / (elapsedMs / 1000)),
          latency: Statistics.latency(samples.map((s) => s.durationMs)),
        };
      })
      .sort((a, b) => b.totalRequests - a.totalRequests);
  }

  private buildTimeline(): TimelineBucket[] {
    const buckets = new Map<number, { requests: number; errors: number; latencySum: number }>();
    for (const sample of this.samples) {
      const second = this.secondOf(sample.startedAt);
      const bucket = buckets.get(second) ?? { requests: 0, errors: 0, latencySum: 0 };
      bucket.requests += 1;
      bucket.latencySum += sample.durationMs;
      if (!sample.success) bucket.errors += 1;
      buckets.set(second, bucket);
    }
    const lastSecond = Math.max(0, ...buckets.keys());
    const timeline: TimelineBucket[] = [];
    for (let second = 0; second <= lastSecond; second++) {
      const bucket = buckets.get(second) ?? { requests: 0, errors: 0, latencySum: 0 };
      timeline.push({
        second,
        requests: bucket.requests,
        errors: bucket.errors,
        avgLatencyMs: bucket.requests ? round(bucket.latencySum / bucket.requests) : 0,
        activeUsers: this.activeUsersBySecond.get(second) ?? 0,
      });
    }
    return timeline;
  }

  private trackActiveUsers(timestamp: number): void {
    const second = this.secondOf(timestamp);
    const current = this.activeUsersBySecond.get(second) ?? 0;
    this.activeUsersBySecond.set(second, Math.max(current, this.activeUsers));
  }

  private secondOf(timestamp: number): number {
    return Math.max(0, Math.floor((timestamp - this.startedAt) / 1000));
  }
}
