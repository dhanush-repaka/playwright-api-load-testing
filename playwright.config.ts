import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import { ConfigManager } from './src/config/ConfigManager';

const config = ConfigManager.get();
const isCI = !!process.env.CI;

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: ['src/fixtures/index.ts', 'src/steps/**/*.ts'],
  outputDir: '.features-gen',
  missingSteps: 'fail-on-gen',
});

export default defineConfig({
  projects: [
    /** Fast self-tests of the framework's own logic (no load generated). */
    { name: 'framework-unit', testDir: 'tests/unit' },
    /** BDD load scenarios generated from features/**. */
    { name: 'api-load', testDir },
  ],
  /**
   * Load scenarios run one at a time: concurrent scenarios would compete
   * for client CPU/network and skew each other's latency numbers.
   */
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: isCI,
  timeout: Number(process.env.SCENARIO_TIMEOUT_MS ?? 15 * 60_000),
  expect: { timeout: 10_000 },
  outputDir: 'reports/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/playwright-html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit/results.xml' }],
    ['json', { outputFile: 'reports/json/results.json' }],
    ['./src/core/reporting/PerformanceDashboardReporter.ts'],
  ],
  use: {
    baseURL: config.baseUrl,
    extraHTTPHeaders: config.environment.defaultHeaders,
  },
  /** Spin up the bundled mock API automatically when targeting the local environment. */
  webServer: config.isLocal
    ? {
        command: 'npm run mock:server',
        url: `${config.baseUrl}/health`,
        reuseExistingServer: !isCI,
        timeout: 30_000,
        stdout: 'ignore',
        stderr: 'pipe',
      }
    : undefined,
});
