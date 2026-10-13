import type { LoadProfile, LoadProfileOverrides, LoadTestSummary, SlaThreshold, WeightedOperation } from '@types';
import type { ConfigManager } from '@config/ConfigManager';
import type { LoadTestPlan } from '@core/load/LoadEngine';
import type { AuthProvider } from '@core/auth/AuthProvider';
import type { OperationRegistry } from '@core/load/OperationRegistry';
import { EndpointOperation, type EndpointOptions } from '@core/load/EndpointOperation';

interface PlannedOperation {
  reference: string;
  weight: number;
  endpoint?: EndpointOptions;
}

/**
 * Scenario-scoped state shared between Given/When/Then steps (the BDD "world").
 * Steps progressively configure it; the When step turns it into a LoadTestPlan.
 */
export class LoadTestContext {
  profileName: string;
  overrides: LoadProfileOverrides = {};
  setupOperations: string[] = [];
  operations: PlannedOperation[] = [];
  sequential = false;
  thresholds: SlaThreshold[] = [];
  abortOnErrorRate?: number;
  pendingPayload?: string;
  pendingExpectedStatus?: number[];
  summary?: LoadTestSummary;
  /** Set by auth steps to override the environment's default authentication. */
  auth?: AuthProvider;

  constructor(
    private readonly config: ConfigManager,
    private readonly registry: OperationRegistry,
  ) {
    this.profileName = config.defaultProfileName;
  }

  useProfile(name: string): void {
    this.profileName = name;
  }

  override(overrides: LoadProfileOverrides): void {
    this.overrides = { ...this.overrides, ...overrides };
  }

  addOperation(reference: string, weight = 1): void {
    const isEndpoint = EndpointOperation.isEndpoint(reference);
    if (!isEndpoint && (this.pendingPayload || this.pendingExpectedStatus)) {
      throw new Error(
        `"the request payload template" / "the expected response status" steps only apply to ad-hoc endpoints ` +
          `(e.g. "GET /api/users"); "${reference}" is a registered operation that defines its own.`,
      );
    }
    if (!Number.isFinite(weight) || weight <= 0) throw new Error(`Invalid weight "${weight}" for "${reference}"`);
    this.operations.push({
      reference,
      weight,
      endpoint: isEndpoint
        ? { payloadTemplate: this.pendingPayload, expectedStatus: this.pendingExpectedStatus }
        : undefined,
    });
  }

  get profile(): LoadProfile {
    return this.config.getLoadProfile(this.profileName, this.overrides);
  }

  /** Thresholds defined in the scenario, falling back to the environment defaults. */
  get effectiveThresholds(): SlaThreshold[] {
    return this.thresholds.length ? this.thresholds : this.config.environment.defaultThresholds;
  }

  get requireSummary(): LoadTestSummary {
    if (!this.summary) throw new Error('No load test has been executed in this scenario yet');
    return this.summary;
  }

  toPlan(scenario: string): LoadTestPlan {
    const operations: WeightedOperation[] = this.operations.map((planned) => ({
      weight: planned.weight,
      operation: planned.endpoint
        ? EndpointOperation.create(planned.reference, planned.endpoint)
        : this.registry.get(planned.reference),
    }));
    return {
      scenario,
      environment: this.config.environment.name,
      profile: this.profile,
      setup: this.setupOperations.map((name) => this.registry.get(name)),
      operations,
      sequential: this.sequential,
      abortOnErrorRate: this.abortOnErrorRate,
      auth: this.auth,
    };
  }
}
