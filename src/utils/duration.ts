const UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  sec: 1_000,
  secs: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  min: 60_000,
  mins: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
};

/** Regex shared with the BDD `{duration}` parameter type. */
export const DURATION_PATTERN = /\d+(?:\.\d+)?\s*(?:ms|s|secs?|seconds?|m|mins?|minutes?|h|hours?)/;

/**
 * Parses human-friendly durations: "500ms", "30s", "2m", "1.5 minutes".
 * A bare number is treated as milliseconds.
 */
export function parseDuration(input: string | number): number {
  if (typeof input === 'number') return input;
  const match = input.trim().match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/i);
  if (!match) throw new Error(`Invalid duration: "${input}"`);
  const [, value, rawUnit] = match;
  const unit = rawUnit.toLowerCase() || 'ms';
  const factor = UNIT_TO_MS[unit];
  if (factor === undefined) throw new Error(`Unknown duration unit "${rawUnit}" in "${input}"`);
  return Math.round(Number(value) * factor);
}

export function formatDuration(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1_000)}s`;
}

export const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
