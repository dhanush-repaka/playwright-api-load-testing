import fs from 'node:fs';
import path from 'node:path';
import type { VirtualUserContext } from '@types';
import { TemplateEngine } from '@utils/TemplateEngine';
import { pickOne } from '@utils/random';

const DATA_ROOT = path.resolve(__dirname, '../../../test-data');

export type FeedStrategy = 'sequential' | 'random' | 'per-user';

/**
 * Loads payload templates and datasets from /test-data with caching, and
 * renders them per request so each VU sends unique, realistic data.
 */
export class TestDataManager {
  private static readonly cache = new Map<string, unknown>();

  /** Reads a JSON file relative to test-data/payloads (cached). */
  static payloadTemplate<T = unknown>(relativePath: string): T {
    return TestDataManager.readJson<T>(path.join('payloads', relativePath));
  }

  /** Reads and renders a payload template for the given VU. */
  static payload<T = unknown>(relativePath: string, vu?: VirtualUserContext, overrides: Partial<T> = {}): T {
    const template = TestDataManager.payloadTemplate<T>(relativePath);
    return { ...TemplateEngine.render(template, vu), ...overrides };
  }

  /** Reads a dataset (array of records) from test-data/datasets. */
  static dataset<T = Record<string, unknown>>(name: string): T[] {
    const data = TestDataManager.readJson<T[]>(path.join('datasets', name.endsWith('.json') ? name : `${name}.json`));
    if (!Array.isArray(data) || data.length === 0) throw new Error(`Dataset "${name}" must be a non-empty array`);
    return data;
  }

  /**
   * Creates a feeder closure over a dataset (data-driven parameterisation).
   *  - sequential: round-robin across all calls
   *  - random:     random record per call
   *  - per-user:   VU n always gets record n (mod size), stable per user
   */
  static feeder<T = Record<string, unknown>>(name: string, strategy: FeedStrategy = 'sequential') {
    const records = TestDataManager.dataset<T>(name);
    let cursor = 0;
    return (vu?: VirtualUserContext): T => {
      switch (strategy) {
        case 'random':
          return pickOne(records);
        case 'per-user':
          return records[((vu?.id ?? 1) - 1) % records.length];
        default:
          return records[cursor++ % records.length];
      }
    };
  }

  private static readJson<T>(relativePath: string): T {
    const file = path.join(DATA_ROOT, relativePath);
    if (!TestDataManager.cache.has(file)) {
      if (!fs.existsSync(file)) throw new Error(`Test data file not found: ${file}`);
      TestDataManager.cache.set(file, JSON.parse(fs.readFileSync(file, 'utf-8')));
    }
    return structuredClone(TestDataManager.cache.get(file)) as T;
  }
}
