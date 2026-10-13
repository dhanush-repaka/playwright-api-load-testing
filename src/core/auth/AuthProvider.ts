import type { APIRequestContext } from '@playwright/test';
import type { AuthConfig, BearerAuthConfig, OAuth2ClientCredentialsConfig } from '@types';
import { Logger } from '@utils/Logger';

/**
 * Supplies authentication headers for outgoing requests (Strategy pattern).
 * Called per request, so providers can transparently refresh expiring tokens
 * during long-running (soak) tests.
 */
export interface AuthProvider {
  readonly description: string;
  headers(): Promise<Record<string, string>>;
}

export class NoAuthProvider implements AuthProvider {
  readonly description = 'none';

  async headers(): Promise<Record<string, string>> {
    return {};
  }
}

/** Static, pre-issued bearer token read from an environment variable. */
export class BearerTokenAuthProvider implements AuthProvider {
  readonly description: string;
  private readonly header: Record<string, string>;

  constructor(token: string, options: { headerName?: string; scheme?: string; source?: string } = {}) {
    const cleaned = token.trim().replace(/^Bearer\s+/i, '');
    if (!cleaned) throw new Error('Bearer token is empty');
    const scheme = options.scheme ?? 'Bearer';
    this.header = { [options.headerName ?? 'Authorization']: scheme ? `${scheme} ${cleaned}` : cleaned };
    this.description = `bearer (${options.source ?? 'static token'}, ${maskSecret(cleaned)})`;
  }

  static fromEnv(config: BearerAuthConfig): BearerTokenAuthProvider {
    const token = process.env[config.tokenEnvVar];
    if (!token?.trim()) {
      throw new Error(
        `Auth type "bearer" requires a token in the ${config.tokenEnvVar} environment variable ` +
          `(set it in .env locally or as a CI secret).`,
      );
    }
    return new BearerTokenAuthProvider(token, { ...config, source: config.tokenEnvVar });
  }

  async headers(): Promise<Record<string, string>> {
    return this.header;
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

/**
 * OAuth2 client-credentials grant. One token is shared by all virtual users
 * (as a real service account would be) and refreshed shortly before expiry.
 * Concurrent callers during a refresh share a single in-flight request.
 */
export class OAuth2ClientCredentialsProvider implements AuthProvider {
  readonly description: string;
  private readonly log = Logger.for('OAuth2');
  private token?: string;
  private expiresAt = 0;
  private inFlight?: Promise<string>;

  constructor(
    private readonly http: APIRequestContext,
    private readonly config: OAuth2ClientCredentialsConfig,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {
    this.description = `oauth2 client-credentials (client ${maskSecret(clientId)})`;
  }

  async headers(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.getToken()}` };
  }

  private async getToken(): Promise<string> {
    const skewMs = (this.config.refreshSkewSeconds ?? 60) * 1000;
    if (this.token && Date.now() < this.expiresAt - skewMs) return this.token;
    this.inFlight ??= this.fetchToken().finally(() => (this.inFlight = undefined));
    return this.inFlight;
  }

  private async fetchToken(): Promise<string> {
    const form: Record<string, string> = {
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    };
    if (this.config.scope) form.scope = this.config.scope;
    if (this.config.audience) form.audience = this.config.audience;

    const tokenUrl = process.env.OAUTH_TOKEN_URL ?? this.config.tokenUrl;
    const response = await this.http.post(tokenUrl, {
      form,
      // Explicit: global JSON Content-Type defaults would otherwise override form encoding.
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      failOnStatusCode: false,
    });
    if (!response.ok()) {
      // Body is deliberately not logged: identity providers may echo request details.
      throw new Error(`OAuth2 token request to ${tokenUrl} failed with HTTP ${response.status()}`);
    }
    const body = (await response.json()) as TokenResponse;
    if (!body.access_token) throw new Error(`OAuth2 token response from ${tokenUrl} has no access_token`);

    this.token = body.access_token;
    this.expiresAt = Date.now() + (body.expires_in ?? 3600) * 1000;
    this.log.info(`Obtained access token (expires in ${body.expires_in ?? 3600}s)`);
    return this.token;
  }
}

/** Builds the provider described by the environment's auth config (Factory). */
export function createAuthProvider(config: AuthConfig | undefined, http: APIRequestContext): AuthProvider {
  switch (config?.type ?? 'none') {
    case 'none':
      return new NoAuthProvider();
    case 'bearer':
      return BearerTokenAuthProvider.fromEnv(config as BearerAuthConfig);
    case 'oauth2': {
      const oauth = config as OAuth2ClientCredentialsConfig;
      const clientId = process.env[oauth.clientIdEnvVar];
      const clientSecret = process.env[oauth.clientSecretEnvVar];
      if (!clientId || !clientSecret) {
        throw new Error(
          `Auth type "oauth2" requires ${oauth.clientIdEnvVar} and ${oauth.clientSecretEnvVar} environment variables.`,
        );
      }
      return new OAuth2ClientCredentialsProvider(http, oauth, clientId, clientSecret);
    }
    default:
      throw new Error(`Unsupported auth type "${(config as { type: string }).type}"`);
  }
}

/** Shows only enough of a secret to identify it in logs: "eyJh…x9Qk". */
export function maskSecret(secret: string): string {
  return secret.length <= 8 ? '****' : `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}
