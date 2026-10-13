import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test';
import { ConfigManager } from '@config/ConfigManager';
import { type AuthProvider, createAuthProvider } from '@core/auth/AuthProvider';
import { Logger } from '@utils/Logger';
import { ApiClient } from './ApiClient';

type PlaywrightLib = PlaywrightWorkerArgs['playwright'];

/**
 * Creates isolated ApiClient instances (Factory pattern).
 * Each virtual user gets its own APIRequestContext so cookies and keep-alive
 * connections are not shared between simulated users. All clients share the
 * environment's AuthProvider unless a scenario supplies its own.
 */
export class ApiClientFactory {
  private readonly log = Logger.for('ApiClientFactory');
  private defaultAuth?: Promise<AuthProvider>;
  private authContext?: APIRequestContext;

  constructor(
    private readonly playwright: PlaywrightLib,
    private readonly config: ConfigManager = ConfigManager.get(),
  ) {}

  /** Environment-level auth, built lazily once and shared (one token for all VUs). */
  get authProvider(): Promise<AuthProvider> {
    this.defaultAuth ??= this.playwright.request
      .newContext({ baseURL: this.config.baseUrl, ignoreHTTPSErrors: this.config.isLocal })
      .then(async (http) => {
        this.authContext = http;
        const provider = createAuthProvider(this.config.environment.auth, http);
        await provider.headers(); // fail fast: missing token / bad OAuth credentials stop the run before load starts
        this.log.info(`Auth: ${provider.description}`);
        return provider;
      });
    return this.defaultAuth;
  }

  async create(extraHeaders: Record<string, string> = {}, auth?: AuthProvider): Promise<ApiClient> {
    const { environment } = this.config;
    const context = await this.playwright.request.newContext({
      baseURL: environment.baseUrl,
      extraHTTPHeaders: { ...environment.defaultHeaders, ...extraHeaders },
      timeout: environment.requestTimeoutMs,
      ignoreHTTPSErrors: this.config.isLocal,
    });
    return new ApiClient(context, environment.requestTimeoutMs, auth ?? (await this.authProvider));
  }

  async dispose(): Promise<void> {
    await this.authContext?.dispose();
  }
}
