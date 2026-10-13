import { randomUUID } from 'node:crypto';

export const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

export const randomString = (length = 8): string =>
  Array.from({ length }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[randomInt(0, 35)]).join('');

export const randomEmail = (): string => `perf.${randomString(10)}@loadtest.local`;

export const uuid = (): string => randomUUID();

export function pickOne<T>(items: readonly T[]): T {
  if (items.length === 0) throw new Error('Cannot pick from an empty list');
  return items[randomInt(0, items.length - 1)];
}

/** Selects an item proportionally to its weight. */
export function pickWeighted<T extends { weight: number }>(items: readonly T[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}
