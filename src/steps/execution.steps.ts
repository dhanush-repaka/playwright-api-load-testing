import type { DataTable } from 'playwright-bdd';
import type { LoadTestContext } from '@fixtures/LoadTestContext';
import type { LoadEngine } from '@core/load/LoadEngine';
import { When } from '@fixtures/index';

/** Shared executor used by every "When" step (single place for run semantics). */
async function execute(loadContext: LoadTestContext, loadEngine: LoadEngine, scenario: string): Promise<void> {
  loadContext.summary = await loadEngine.run(loadContext.toPlan(scenario));
}

/** Single named operation ("users.list") or ad-hoc endpoint ("GET /api/products"). */
When('virtual users execute {string}', async ({ loadContext, loadEngine, $testInfo }, reference: string) => {
  loadContext.addOperation(reference);
  await execute(loadContext, loadEngine, $testInfo.title);
});

/**
 * Weighted traffic mix - models realistic production ratios.
 * | operation       | weight |
 * | products.list   | 60     |
 * | products.search | 30     |
 */
When(
  'virtual users execute the weighted operation mix:',
  async ({ loadContext, loadEngine, $testInfo }, table: DataTable) => {
    for (const row of table.hashes()) loadContext.addOperation(row.operation, Number(row.weight ?? 1));
    await execute(loadContext, loadEngine, $testInfo.title);
  },
);

/**
 * Ordered user journey - every iteration runs all steps in sequence.
 * | operation     |
 * | products.list |
 * | orders.create |
 */
When('virtual users execute the user journey:', async ({ loadContext, loadEngine, $testInfo }, table: DataTable) => {
  loadContext.sequential = true;
  for (const row of table.hashes()) loadContext.addOperation(row.operation);
  await execute(loadContext, loadEngine, $testInfo.title);
});
