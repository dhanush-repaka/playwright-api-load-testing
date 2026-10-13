import type { LogLevel } from '@types';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

/**
 * Minimal structured logger. Scoped child loggers keep output traceable
 * (e.g. "[LoadEngine]") without pulling in a heavyweight dependency.
 */
export class Logger {
  private static override: LogLevel | undefined;

  constructor(private readonly scope: string) {}

  static setLevel(level: LogLevel): void {
    Logger.override = level;
  }

  /** Read on each call so LOG_LEVEL from .env applies regardless of import order. */
  private static get level(): LogLevel {
    if (Logger.override) return Logger.override;
    const fromEnv = process.env.LOG_LEVEL as LogLevel | undefined;
    return fromEnv && fromEnv in LEVEL_WEIGHT ? fromEnv : 'info';
  }

  static for(scope: string): Logger {
    return new Logger(scope);
  }

  debug(message: string, meta?: unknown): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.log('error', message, meta);
  }

  private log(level: LogLevel, message: string, meta?: unknown): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[Logger.level]) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${this.scope}] ${message}`;
    const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (meta === undefined) writer(line);
    else writer(line, typeof meta === 'string' ? meta : JSON.stringify(meta));
  }
}
