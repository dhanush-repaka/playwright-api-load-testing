/**
 * Shared domain types for the load-testing framework.
 * Keeping contracts in one place lets every layer (engine, services, steps,
 * reporters) depend on abstractions instead of concrete implementations.
 */
import type { ApiClient } from '../core/http/ApiClient';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export interface EnvironmentConfig {
  name: string;
  baseUrl: string;
  requestTimeoutMs: number;
  defaultHeaders: Record<string, string>;
  defaultLoadProfile: string;
  defaultThresholds: SlaThreshold[];
  auth?: AuthConfig;
}

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

/**
 * How requests are authenticated. Secrets are never stored in JSON - only
 * the *names* of the environment variables that hold them.
 */
export type AuthConfig = NoAuthConfig | BearerAuthConfig | OAuth2ClientCredentialsConfig;

export interface NoAuthConfig {
  type: 'none';
}

/** Pre-issued token (the usual corporate hand-over: "here is the URL and a bearer token"). */
export interface BearerAuthConfig {
  type: 'bearer';
  /** Env var holding the token, e.g. API_BEARER_TOKEN. */
  tokenEnvVar: string;
  /** Defaults to "Authorization". Some gateways use e.g. "X-Api-Token". */
  headerName?: string;
  /** Defaults to "Bearer". Use "" to send the raw token. */
  scheme?: string;
}

/** Machine-to-machine OAuth2: the framework fetches (and refreshes) the bearer token itself. */
export interface OAuth2ClientCredentialsConfig {
  type: 'oauth2';
  /** Absolute URL, or a path relative to baseUrl. Overridable with OAUTH_TOKEN_URL. */
  tokenUrl: string;
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  scope?: string;
  audience?: string;
  /** Refresh this many seconds before expiry (default 60). */
  refreshSkewSeconds?: number;
}

/* ------------------------------------------------------------------ */
/* Load profiles                                                       */
/* ------------------------------------------------------------------ */

export interface LoadProfile {
  name: string;
  description?: string;
  /** Number of concurrent virtual users (VUs). */
  virtualUsers: number;
  /** Time over which all VUs are started (linear ramp). */
  rampUpMs: number;
  /** Total test duration including ramp-up. Ignored when iterationsPerUser is set. */
  durationMs: number;
  /** Fixed iterations per VU. When set, the test ends once every VU completes them. */
  iterationsPerUser?: number;
  /** Pause between two iterations of the same VU. */
  thinkTimeMs: number;
  /** Random +/- jitter applied to think time to avoid lock-step traffic. */
  thinkTimeJitterMs?: number;
}

export type LoadProfileOverrides = Partial<Omit<LoadProfile, 'name'>>;

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

export interface ApiRequest {
  method: HttpMethod;
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
  timeoutMs?: number;
  /** Logical name used to group metrics, e.g. "users.list". */
  label?: string;
}

export interface ApiResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: T | null;
  rawBody: string;
  durationMs: number;
  sizeBytes: number;
}

/* ------------------------------------------------------------------ */
/* Virtual users & operations                                          */
/* ------------------------------------------------------------------ */

export interface VirtualUserContext {
  id: number;
  /** Dedicated HTTP client (own connection pool / cookies) for this VU. */
  client: ApiClient;
  iteration: number;
  /** Per-VU mutable store (tokens, created ids, etc.). */
  session: Map<string, unknown>;
}

/**
 * A named, reusable unit of work executed by a virtual user.
 * Operations are registered by services and referenced from feature files.
 */
export interface Operation {
  name: string;
  description?: string;
  expectedStatus: number[];
  execute: (vu: VirtualUserContext) => Promise<ApiResponse>;
}

export interface WeightedOperation {
  operation: Operation;
  weight: number;
}

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

export interface RequestSample {
  operation: string;
  status: number;
  success: boolean;
  durationMs: number;
  sizeBytes: number;
  startedAt: number;
  virtualUser: number;
  error?: string;
}

export interface LatencyStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p90: number;
  p95: number;
  p99: number;
  stdDev: number;
}

export interface OperationSummary {
  operation: string;
  totalRequests: number;
  failedRequests: number;
  errorRate: number;
  throughput: number;
  latency: LatencyStats;
}

export interface TimelineBucket {
  second: number;
  requests: number;
  errors: number;
  avgLatencyMs: number;
  activeUsers: number;
}

export interface LoadTestSummary {
  scenario: string;
  profile: LoadProfile;
  environment: string;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  throughput: number;
  bytesReceived: number;
  latency: LatencyStats;
  statusCodes: Record<string, number>;
  errors: Record<string, number>;
  operations: OperationSummary[];
  timeline: TimelineBucket[];
  thresholds?: SlaResult[];
}

/* ------------------------------------------------------------------ */
/* SLA                                                                 */
/* ------------------------------------------------------------------ */

export type SlaMetric =
  'min' | 'max' | 'mean' | 'median' | 'p90' | 'p95' | 'p99' | 'errorRate' | 'throughput' | 'totalRequests';

export type SlaOperator = '<' | '<=' | '>' | '>=' | '==';

export interface SlaThreshold {
  metric: SlaMetric;
  operator: SlaOperator;
  value: number;
  /** Optional operation scope; omitted means the aggregate across all operations. */
  operation?: string;
}

export interface SlaResult extends SlaThreshold {
  actual: number;
  passed: boolean;
}
