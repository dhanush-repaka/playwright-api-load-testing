import { test as base, createBdd } from 'playwright-bdd';
import { ConfigManager } from '@config/ConfigManager';
import type { ApiClient } from '@core/http/ApiClient';
import { ApiClientFactory } from '@core/http/ApiClientFactory';
import { LoadEngine } from '@core/load/LoadEngine';
import type { OperationRegistry } from '@core/load/OperationRegistry';
import { buildOperationRegistry } from '@services/index';
import { LoadTestContext } from './LoadTestContext';

interface TestFixtures {
  config: ConfigManager;
  clientFactory: ApiClientFactory;
  /** Single client for functional pre-checks (outside of the load run). */
  apiClient: ApiClient;
  loadEngine: LoadEngine;
  loadContext: LoadTestContext;
}

interface WorkerFixtures {
  operationRegistry: OperationRegistry;
}

/**
 * Dependency-injection container for steps (Playwright fixtures).
 * Every step receives only what it asks for; lifecycles (create/dispose)
 * are managed here rather than in step code.
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  operationRegistry: [
    async ({}, use) => {
      await use(buildOperationRegistry());
    },
    { scope: 'worker' },
  ],

  config: async ({}, use) => {
    await use(ConfigManager.get());
  },

  clientFactory: async ({ playwright, config }, use) => {
    const factory = new ApiClientFactory(playwright, config);
    await use(factory);
    await factory.dispose();
  },

  apiClient: async ({ clientFactory }, use) => {
    const client = await clientFactory.create();
    await use(client);
    await client.dispose();
  },

  loadEngine: async ({ clientFactory }, use) => {
    await use(new LoadEngine(clientFactory));
  },

  loadContext: async ({ config, operationRegistry }, use) => {
    await use(new LoadTestContext(config, operationRegistry));
  },
});

export const { Given, When, Then, Before, After, BeforeAll, AfterAll } = createBdd(test);
