import type {
  LoadProfile,
  LoadTestSummary,
  Operation,
  RequestSample,
  VirtualUserContext,
  WeightedOperation,
} from '@types';
import type { ApiClientFactory } from '@core/http/ApiClientFactory';
import type { AuthProvider } from '@core/auth/AuthProvider';
import { MetricsCollector } from '@core/metrics/MetricsCollector';
import { Logger } from '@utils/Logger';
import { formatDuration, sleep } from '@utils/duration';
import { pickWeighted, randomInt } from '@utils/random';

export interface LoadTestPlan {
  scenario: string;
  environment: string;
  profile: LoadProfile;
  /** Operations executed once per VU before the main loop (e.g. login). Recorded in metrics. */
  setup?: Operation[];
  /** Weighted mix of operations executed on every iteration. */
  operations: WeightedOperation[];
  /** Run all operations in order per iteration (user journey) instead of a weighted pick. */
  sequential?: boolean;
  /** Circuit breaker: abort early when the error rate (%) exceeds this after `abortMinSamples`. */
  abortOnErrorRate?: number;
  abortMinSamples?: number;
  /** Scenario-level auth override; defaults to the environment's auth config. */
  auth?: AuthProvider;
}

/**
 * Closed-model load generator.
 *
 * Starts N virtual users linearly over the ramp-up window. Each VU owns an
 * isolated HTTP client and loops (pick operation -> execute -> record ->
 * think) until the duration elapses or its iteration budget is spent.
 */
export class LoadEngine {
  private readonly log = Logger.for('LoadEngine');
  private aborted: string | undefined;

  constructor(private readonly clientFactory: ApiClientFactory) {}

  async run(plan: LoadTestPlan): Promise<LoadTestSummary> {
    LoadEngine.validatePlan(plan);
    const { profile } = plan;
    if (!plan.auth) await this.clientFactory.authProvider; // surface auth misconfiguration before any VU starts
    const metrics = new MetricsCollector();
    this.aborted = undefined;

    this.log.info(
      `Starting "${plan.scenario}" | profile=${profile.name} VUs=${profile.virtualUsers} ` +
        `rampUp=${formatDuration(profile.rampUpMs)} ` +
        (profile.iterationsPerUser
          ? `iterations/VU=${profile.iterationsPerUser}`
          : `duration=${formatDuration(profile.durationMs)}`),
    );

    metrics.start();
    const deadline = Date.now() + profile.durationMs;
    const rampStep = profile.virtualUsers > 1 ? profile.rampUpMs / (profile.virtualUsers - 1) : 0;

    const users = Array.from({ length: profile.virtualUsers }, (_, index) =>
      sleep(Math.round(index * rampStep)).then(() => this.runVirtualUser(index + 1, plan, metrics, deadline)),
    );
    const progress = this.startProgressReporter(metrics, profile);

    // allSettled (not all): one failing VU must not abandon the others mid-run.
    let results: PromiseSettledResult<void>[];
    try {
      results = await Promise.allSettled(users);
    } finally {
      clearInterval(progress);
      metrics.stop();
    }
    const crashed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (crashed.length) {
      throw new Error(`${crashed.length} virtual user(s) crashed: ${String(crashed[0].reason)}`);
    }

    const summary = metrics.summarize(plan.scenario, profile, plan.environment);
    if (this.aborted) summary.errors[`ABORTED: ${this.aborted}`] = 1;
    this.log.info(
      `Finished "${plan.scenario}" | requests=${summary.totalRequests} rps=${summary.throughput} ` +
        `errors=${summary.errorRate}% p95=${summary.latency.p95}ms`,
    );
    return summary;
  }

  private async runVirtualUser(
    id: number,
    plan: LoadTestPlan,
    metrics: MetricsCollector,
    deadline: number,
  ): Promise<void> {
    const { profile } = plan;
    if (this.shouldStop(deadline, profile, 0)) return;

    const client = await this.clientFactory.create({ 'X-Virtual-User': String(id) }, plan.auth);
    const vu: VirtualUserContext = { id, client, iteration: 0, session: new Map() };
    metrics.userStarted();

    try {
      for (const operation of plan.setup ?? []) {
        await this.executeAndRecord(operation, vu, metrics);
      }

      while (!this.shouldStop(deadline, profile, vu.iteration)) {
        const batch = plan.sequential
          ? plan.operations.map((w) => w.operation)
          : [pickWeighted(plan.operations).operation];

        for (const operation of batch) {
          if (this.aborted || (Date.now() >= deadline && !profile.iterationsPerUser)) break;
          await this.executeAndRecord(operation, vu, metrics);
        }
        vu.iteration += 1;
        this.checkCircuitBreaker(plan, metrics);
        await sleep(LoadEngine.thinkTime(profile));
      }
    } finally {
      metrics.userStopped();
      await client.dispose();
    }
  }

  private async executeAndRecord(
    operation: Operation,
    vu: VirtualUserContext,
    metrics: MetricsCollector,
  ): Promise<void> {
    const startedAt = Date.now();
    let sample: RequestSample;
    try {
      const response = await operation.execute(vu);
      const success = operation.expectedStatus.includes(response.status);
      sample = {
        operation: operation.name,
        status: response.status,
        success,
        durationMs: response.durationMs,
        sizeBytes: response.sizeBytes,
        startedAt,
        virtualUser: vu.id,
        error: success
          ? undefined
          : response.status === 0
            ? `Network: ${response.rawBody.slice(0, 120)}`
            : `HTTP ${response.status} (expected ${operation.expectedStatus.join('/')}) on ${operation.name}`,
      };
    } catch (error) {
      sample = {
        operation: operation.name,
        status: 0,
        success: false,
        durationMs: Date.now() - startedAt,
        sizeBytes: 0,
        startedAt,
        virtualUser: vu.id,
        error: `Exception in ${operation.name}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    metrics.record(sample);
  }

  private shouldStop(deadline: number, profile: LoadProfile, iteration: number): boolean {
    if (this.aborted) return true;
    if (profile.iterationsPerUser) return iteration >= profile.iterationsPerUser;
    return Date.now() >= deadline;
  }

  private checkCircuitBreaker(plan: LoadTestPlan, metrics: MetricsCollector): void {
    if (plan.abortOnErrorRate === undefined || this.aborted) return;
    const minSamples = plan.abortMinSamples ?? 50;
    if (metrics.sampleCount < minSamples) return;
    const { errorRate } = metrics;
    if (errorRate > plan.abortOnErrorRate) {
      this.aborted = `error rate ${errorRate}% exceeded ${plan.abortOnErrorRate}%`;
      this.log.warn(`Circuit breaker tripped: ${this.aborted}`);
    }
  }

  private startProgressReporter(metrics: MetricsCollector, profile: LoadProfile): NodeJS.Timeout {
    const interval = Math.min(Math.max(profile.durationMs / 6, 2_000), 10_000);
    return setInterval(() => this.log.info(`... in progress: ${metrics.sampleCount} requests recorded`), interval);
  }

  private static thinkTime(profile: LoadProfile): number {
    const jitter = profile.thinkTimeJitterMs ?? 0;
    return Math.max(0, profile.thinkTimeMs + (jitter ? randomInt(-jitter, jitter) : 0));
  }

  private static validatePlan(plan: LoadTestPlan): void {
    if (!plan.operations.length) throw new Error('Load test plan has no operations');
    if (plan.operations.some((o) => o.weight <= 0)) throw new Error('Operation weights must be > 0');
  }
}
