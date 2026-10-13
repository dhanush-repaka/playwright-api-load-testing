import { performance } from 'node:perf_hooks';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { ApiRequest, ApiResponse } from '@types';
import type { AuthProvider } from '@core/auth/AuthProvider';
import { Logger } from '@utils/Logger';

/**
 * Thin, typed wrapper over Playwright's APIRequestContext.
 *
 * - Normalises every call into an ApiResponse (status, timing, size, parsed body)
 * - Never throws on HTTP errors or network failures: load tests must record
 *   failures as samples rather than abort the run.
 * - Adds auth headers from the AuthProvider on every request; headers set
 *   explicitly on a request (e.g. a per-user login token) take precedence.
 */
export class ApiClient {
  private readonly log = Logger.for('ApiClient');

  constructor(
    private readonly context: APIRequestContext,
    private readonly defaultTimeoutMs: number,
    private readonly auth?: AuthProvider,
  ) {}

  async send<T = unknown>(request: ApiRequest): Promise<ApiResponse<T>> {
    let started = performance.now();
    try {
      // Resolved before timing starts: token fetch/refresh is not the API's latency.
      const authHeaders = this.auth ? await this.auth.headers() : {};
      started = performance.now();
      const response = await this.context.fetch(request.path, {
        method: request.method,
        headers: ApiClient.mergeHeaders(authHeaders, request.headers),
        params: request.query,
        data: request.body,
        timeout: request.timeoutMs ?? this.defaultTimeoutMs,
        failOnStatusCode: false,
      });
      const durationMs = performance.now() - started;
      return await ApiClient.toApiResponse<T>(response, durationMs);
    } catch (error) {
      const durationMs = performance.now() - started;
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      this.log.debug(`${request.method} ${request.path} failed: ${message}`);
      return {
        status: 0,
        ok: false,
        headers: {},
        body: null,
        rawBody: message,
        durationMs,
        sizeBytes: 0,
      };
    }
  }

  get<T = unknown>(path: string, options: Omit<ApiRequest, 'method' | 'path'> = {}): Promise<ApiResponse<T>> {
    return this.send<T>({ ...options, method: 'GET', path });
  }

  post<T = unknown>(path: string, body?: unknown, options: Omit<ApiRequest, 'method' | 'path' | 'body'> = {}) {
    return this.send<T>({ ...options, method: 'POST', path, body });
  }

  put<T = unknown>(path: string, body?: unknown, options: Omit<ApiRequest, 'method' | 'path' | 'body'> = {}) {
    return this.send<T>({ ...options, method: 'PUT', path, body });
  }

  patch<T = unknown>(path: string, body?: unknown, options: Omit<ApiRequest, 'method' | 'path' | 'body'> = {}) {
    return this.send<T>({ ...options, method: 'PATCH', path, body });
  }

  delete<T = unknown>(path: string, options: Omit<ApiRequest, 'method' | 'path'> = {}) {
    return this.send<T>({ ...options, method: 'DELETE', path });
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }

  /** Case-insensitive merge: a request-level "authorization" replaces the provider's "Authorization". */
  private static mergeHeaders(base: Record<string, string>, override: Record<string, string> = {}) {
    const overridden = new Set(Object.keys(override).map((k) => k.toLowerCase()));
    const merged = Object.fromEntries(Object.entries(base).filter(([k]) => !overridden.has(k.toLowerCase())));
    return { ...merged, ...override };
  }

  private static async toApiResponse<T>(response: APIResponse, durationMs: number): Promise<ApiResponse<T>> {
    const buffer = await response.body();
    const rawBody = buffer.toString('utf-8');
    let body: T | null = null;
    const contentType = response.headers()['content-type'] ?? '';
    if (contentType.includes('application/json') && rawBody.length) {
      try {
        body = JSON.parse(rawBody) as T;
      } catch {
        body = null;
      }
    }
    return {
      status: response.status(),
      ok: response.ok(),
      headers: response.headers(),
      body,
      rawBody,
      durationMs,
      sizeBytes: buffer.byteLength,
    };
  }
}
