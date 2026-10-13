import { expect } from '@playwright/test';
import type { DataTable } from 'playwright-bdd';
import type { LoadProfileOverrides } from '@types';
import { parseDuration } from '@utils/duration';
import { Given } from '@fixtures/index';
import './parameterTypes';

/* ------------------------------------------------------------------ */
/* Pre-conditions                                                      */
/* ------------------------------------------------------------------ */

Given('the API under test is healthy', async ({ apiClient }) => {
  const response = await apiClient.get('/health');
  expect(response.status, `Health check failed: ${response.rawBody.slice(0, 200)}`).toBe(200);
});

/* ------------------------------------------------------------------ */
/* Load profile                                                        */
/* ------------------------------------------------------------------ */

Given('the {string} load profile', async ({ loadContext }, profile: string) => {
  loadContext.useProfile(profile);
});

Given('{int} virtual user(s) for {duration}', async ({ loadContext }, virtualUsers: number, durationMs: number) => {
  loadContext.override({ virtualUsers, durationMs, iterationsPerUser: undefined });
});

Given('a ramp-up of {duration}', async ({ loadContext }, rampUpMs: number) => {
  loadContext.override({ rampUpMs });
});

Given('a think time of {duration}', async ({ loadContext }, thinkTimeMs: number) => {
  loadContext.override({ thinkTimeMs, thinkTimeJitterMs: 0 });
});

Given('each virtual user performs {int} iteration(s)', async ({ loadContext }, iterationsPerUser: number) => {
  loadContext.override({ iterationsPerUser });
});

/**
 * | virtualUsers | 10   |
 * | duration     | 20s  |
 * | rampUp       | 5s   |
 * | thinkTime    | 100ms|
 * | iterations   | 50   |
 */
Given('the load profile is customised with:', async ({ loadContext }, table: DataTable) => {
  const overrides: LoadProfileOverrides = {};
  for (const [key, value] of Object.entries(table.rowsHash())) {
    switch (key.trim()) {
      case 'virtualUsers':
        overrides.virtualUsers = Number(value);
        break;
      case 'duration':
        overrides.durationMs = parseDuration(value);
        break;
      case 'rampUp':
        overrides.rampUpMs = parseDuration(value);
        break;
      case 'thinkTime':
        overrides.thinkTimeMs = parseDuration(value);
        break;
      case 'thinkTimeJitter':
        overrides.thinkTimeJitterMs = parseDuration(value);
        break;
      case 'iterations':
        overrides.iterationsPerUser = Number(value);
        break;
      default:
        throw new Error(`Unknown load profile property "${key}"`);
    }
  }
  loadContext.override(overrides);
});

/* ------------------------------------------------------------------ */
/* Plan composition                                                    */
/* ------------------------------------------------------------------ */

Given('each virtual user first executes {string}', async ({ loadContext, operationRegistry }, name: string) => {
  operationRegistry.get(name); // fail fast on typos
  loadContext.setupOperations.push(name);
});

Given('the request payload template {string}', async ({ loadContext }, template: string) => {
  loadContext.pendingPayload = template;
});

Given('the expected response status is {int}', async ({ loadContext }, status: number) => {
  loadContext.pendingExpectedStatus = [status];
});

Given('the test aborts when the error rate exceeds {float}%', async ({ loadContext }, rate: number) => {
  loadContext.abortOnErrorRate = rate;
});
