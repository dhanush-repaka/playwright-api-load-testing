import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import type { AuthConfig, EnvironmentConfig, LoadProfile, LoadProfileOverrides } from '@types';

dotenv.config({ quiet: true });

const CONFIG_ROOT = path.resolve(__dirname, '../../config');

/**
 * Single source of truth for runtime configuration.
 *
 * Resolution order (highest wins):
 *   1. Process environment variables (BASE_URL, LOAD_PROFILE, ...)
 *   2. config/environments/<TEST_ENV>.json
 *   3. Framework defaults
 */
export class ConfigManager {
  private static instance: ConfigManager | undefined;

  readonly environment: EnvironmentConfig;
  private readonly profiles: Record<string, Omit<LoadProfile, 'name'>>;

  private constructor() {
    const envName = process.env.TEST_ENV ?? 'local';
    this.environment = this.loadEnvironment(envName);
    this.profiles = this.readJson<Record<string, Omit<LoadProfile, 'name'>>>('load-profiles.json');
  }

  static get(): ConfigManager {
    ConfigManager.instance ??= new ConfigManager();
    return ConfigManager.instance;
  }

  get baseUrl(): string {
    return this.environment.baseUrl;
  }

  /** True when the target is this machine (drives the bundled mock server and TLS leniency). */
  get isLocal(): boolean {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(this.baseUrl).hostname);
  }

  get availableProfiles(): string[] {
    return Object.keys(this.profiles);
  }

  /**
   * Returns a named profile with optional overrides and global multipliers
   * (VU_MULTIPLIER / DURATION_MULTIPLIER) applied, so CI can scale a run
   * without touching feature files.
   */
  getLoadProfile(name: string = this.defaultProfileName, overrides: LoadProfileOverrides = {}): LoadProfile {
    const base = this.profiles[name];
    if (!base) {
      throw new Error(`Unknown load profile "${name}". Available: ${this.availableProfiles.join(', ')}`);
    }
    const merged: LoadProfile = { name, ...base, ...overrides };
    const vuMultiplier = ConfigManager.positiveNumber('VU_MULTIPLIER');
    const durationMultiplier = ConfigManager.positiveNumber('DURATION_MULTIPLIER');
    merged.virtualUsers = Math.max(1, Math.round(merged.virtualUsers * vuMultiplier));
    merged.durationMs = Math.round(merged.durationMs * durationMultiplier);
    merged.rampUpMs = Math.round(merged.rampUpMs * durationMultiplier);
    ConfigManager.validateProfile(merged);
    return merged;
  }

  get defaultProfileName(): string {
    return process.env.LOAD_PROFILE ?? this.environment.defaultLoadProfile;
  }

  private static positiveNumber(envVar: string, fallback = 1): number {
    const raw = process.env[envVar];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${envVar} must be a positive number, got "${raw}"`);
    return value;
  }

  static validateProfile(profile: LoadProfile): void {
    const errors: string[] = [];
    if (!Number.isInteger(profile.virtualUsers) || profile.virtualUsers < 1) {
      errors.push('virtualUsers must be a whole number >= 1');
    }
    if (profile.iterationsPerUser !== undefined && !(profile.iterationsPerUser >= 1)) {
      errors.push('iterationsPerUser must be >= 1');
    }
    if (profile.rampUpMs < 0) errors.push('rampUpMs must be >= 0');
    if (profile.thinkTimeMs < 0) errors.push('thinkTimeMs must be >= 0');
    if (!profile.iterationsPerUser && profile.durationMs <= 0) {
      errors.push('durationMs must be > 0 when iterationsPerUser is not set');
    }
    if (!profile.iterationsPerUser && profile.rampUpMs > profile.durationMs) {
      errors.push('rampUpMs cannot exceed durationMs');
    }
    if (errors.length) throw new Error(`Invalid load profile "${profile.name}": ${errors.join('; ')}`);
  }

  private loadEnvironment(envName: string): EnvironmentConfig {
    const config = this.readJson<EnvironmentConfig>(path.join('environments', `${envName}.json`));
    return {
      ...config,
      baseUrl: (process.env.BASE_URL || config.baseUrl).replace(/\/+$/, ''),
      requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? config.requestTimeoutMs),
      auth: ConfigManager.resolveAuth(config.auth),
    };
  }

  /**
   * AUTH_TYPE lets CI/users switch auth without editing JSON:
   *   none   -> no auth header
   *   bearer -> token from the env var named in JSON (default API_BEARER_TOKEN)
   *   oauth2 -> requires an oauth2 block in the environment JSON
   */
  private static resolveAuth(configured: AuthConfig | undefined): AuthConfig {
    const requested = process.env.AUTH_TYPE?.trim().toLowerCase();
    if (!requested) return configured ?? { type: 'none' };
    if (requested === 'none') return { type: 'none' };
    if (requested === 'bearer') {
      return configured?.type === 'bearer' ? configured : { type: 'bearer', tokenEnvVar: 'API_BEARER_TOKEN' };
    }
    if (requested === 'oauth2') {
      if (configured?.type !== 'oauth2') {
        throw new Error('AUTH_TYPE=oauth2 requires an "auth" block of type "oauth2" in the environment JSON');
      }
      return configured;
    }
    throw new Error(`Unsupported AUTH_TYPE "${process.env.AUTH_TYPE}". Use none, bearer or oauth2.`);
  }

  private readJson<T>(relativePath: string): T {
    const file = path.join(CONFIG_ROOT, relativePath);
    if (!fs.existsSync(file)) throw new Error(`Configuration file not found: ${file}`);
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  }
}
