# Playwright API Load Testing Framework (BDD)

A load and performance testing framework for REST APIs. It is built on **Playwright's `APIRequestContext`**, and you write scenarios in **Gherkin** through [`playwright-bdd`](https://github.com/vitalets/playwright-bdd).

Business-readable feature files describe load scenarios and SLAs. A layered TypeScript core generates the traffic, collects metrics and produces reports.

```gherkin
Scenario: Weighted catalogue browsing traffic
  Given the API under test is healthy
  And the load profile is customised with:
    | virtualUsers | 15   |
    | duration     | 12s  |
    | rampUp       | 3s   |
  When virtual users execute the weighted operation mix:
    | operation        | weight |
    | products.list    | 60     |
    | products.search  | 30     |
    | products.getById | 10     |
  Then the error rate should be at most 1%
  And the p95 response time should be below 500 ms
  And the throughput should be at least 30 requests per second
```

---

## Quick start

```bash
npm install
cp .env.example .env      # already done in this POC
npm test                  # unit self-tests + every load scenario against the bundled mock API
```

When `TEST_ENV=local`, Playwright starts the bundled **mock API** for you (`mock-server/`), so the POC runs fully offline and never load-tests a third-party service.

| Command                                                                            | Purpose                                       |
| ---------------------------------------------------------------------------------- | --------------------------------------------- |
| `npm test`                                                                         | Framework unit tests + all BDD load scenarios |
| `npm run test:smoke` / `test:load` / `test:stress` / `test:spike` / `test:journey` | Run by tag                                    |
| `npm run test:unit`                                                                | Framework self-tests only (fast)              |
| `npm run test:qa` / `test:staging`                                                 | Target another environment                    |
| `npm run report`                                                                   | Open Playwright HTML report                   |
| `npm run report:perf`                                                              | Open the consolidated performance dashboard   |
| `npm run steps:list`                                                               | Print every available Gherkin step            |
| `npm run verify`                                                                   | Type-check + lint + format check              |
| `npm run mock:server`                                                              | Run the mock API on its own                   |

Run-time knobs, with no code changes needed:

```bash
TEST_ENV=qa LOAD_PROFILE=load VU_MULTIPLIER=2 DURATION_MULTIPLIER=0.5 npm run test:load
MOCK_ERROR_RATE=0.3 npm run test:stress     # inject failures into the mock to see the circuit breaker trip
```

---

## Testing your API (URL + bearer token)

This is the usual corporate hand-over: an API URL and a bearer token. Put both in `.env`, which is git-ignored, so secrets never get committed:

```bash
TEST_ENV=qa
BASE_URL=https://api.yourcompany.com
API_BEARER_TOKEN=eyJhbGciOi...        # with or without the "Bearer " prefix
```

Every request then carries `Authorization: Bearer <token>`. Logs show only a masked form (`eyJh…9Qk`), and the token is never written to reports.

### Supported auth types

You set the auth type in `config/environments/<env>.json` under `"auth"`, or override it with the `AUTH_TYPE` environment variable:

| Type     | When to use                                                                                                      | Config                                                                                                                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bearer` | You were given a token (most common)                                                                             | `{ "type": "bearer", "tokenEnvVar": "API_BEARER_TOKEN" }`. Optional: `"headerName": "X-Api-Key"` and `"scheme": ""` for API-key style headers                                                               |
| `oauth2` | You were given a client ID and secret. The framework fetches the token itself and **refreshes it before expiry** | `{ "type": "oauth2", "tokenUrl": "https://login.../token", "clientIdEnvVar": "OAUTH_CLIENT_ID", "clientSecretEnvVar": "OAUTH_CLIENT_SECRET", "scope": "..." }`. See `config/environments/local-oauth2.json` |
| `none`   | Open APIs                                                                                                        | `{ "type": "none" }` or `AUTH_TYPE=none`                                                                                                                                                                    |

Per-user login (the `auth.login` operation) still works. A token stored by a virtual user's own login takes precedence over the environment token.

### Auth in feature files

Steps reference the **name** of an environment variable, never the token itself:

```gherkin
Given requests are authenticated with the bearer token from "API_BEARER_TOKEN_READONLY"   # e.g. a different role
Given requests are sent without authentication                                          # negative test, expect 401
```

See `features/auth/bearer-auth.feature`.

### Fail-fast behaviour

A missing token, wrong OAuth credentials or an unreachable token endpoint stops the scenario **before any load is generated**, with a message naming the variable to set.

In CI, set the `BASE_URL` repository variable and the `API_BEARER_TOKEN` secret (or `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET`).

---

## Architecture

```
features/  (Gherkin: WHAT to test, in business language)
   │
src/steps/ (Given/When/Then: thin glue, no logic)
   │   uses fixtures (dependency injection)
src/fixtures/  ──►  LoadTestContext  (scenario "world": profile, ops, SLAs)
   │
src/core/
   ├── load/        LoadEngine (VUs, ramp-up, think time, circuit breaker)
   │                OperationRegistry, EndpointOperation (ad-hoc endpoints)
   ├── http/        ApiClient (Playwright wrapper), ApiClientFactory, RequestBuilder
   ├── auth/        AuthProvider strategies: none, bearer, OAuth2 client-credentials
   ├── metrics/     MetricsCollector, Statistics (percentiles, std-dev, timeline)
   ├── assertions/  SlaValidator (aggregate and per-operation thresholds)
   ├── data/        TestDataManager (templates, datasets, feeders)
   └── reporting/   HTML/JSON writers + Playwright PerformanceDashboardReporter
   │
src/services/  (Service Object Model: one class per API domain, exposing named operations)
   │
config/        environments/*.json + load-profiles.json
test-data/     payload templates ({{placeholders}}) + datasets
```

### How a scenario runs

1. **Given** steps configure the `LoadTestContext`: the profile, overrides, setup operations, payload and abort policy.
2. **When** turns the context into a `LoadTestPlan`. Then `LoadEngine` starts N virtual users linearly over the ramp-up window. Each VU has its **own isolated `APIRequestContext`**, so cookies and connections are not shared. In each iteration a VU picks an operation (weighted, or a sequential journey), runs it, records a sample and waits for the think time.
3. **Then** steps evaluate SLAs with **soft assertions**, so every threshold is checked and reported.
4. The **After** hook writes per-scenario JSON and HTML and attaches them to the Playwright report. The custom reporter combines all scenarios into `reports/performance/index.html`.

### Engineering principles applied

| Principle / pattern                   | Where                                                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Separation of concerns / layering** | features → steps → fixtures → core → services                                                                                                             |
| **Reusability**                       | Generic step vocabulary works for any operation; `BaseService.define()`; shared `execute()`/`assertSla()` helpers                                         |
| **Parameterisation**                  | Scenario Outlines + Examples, data tables, custom `{duration}` / `{latencyMetric}` parameter types, env-driven config, payload templates, dataset feeders |
| **Dependency injection**              | Playwright fixtures (`config`, `loadEngine`, `loadContext`, `operationRegistry`, …)                                                                       |
| **Singleton**                         | `ConfigManager`                                                                                                                                           |
| **Factory**                           | `ApiClientFactory` (one isolated client per VU), `EndpointOperation.create`, `createAuthProvider`                                                         |
| **Strategy**                          | `AuthProvider` implementations (none, bearer, OAuth2) are swappable through config                                                                        |
| **Builder**                           | `RequestBuilder` (fluent requests)                                                                                                                        |
| **Registry**                          | `OperationRegistry` decouples Gherkin names from code                                                                                                     |
| **Template Method**                   | `BaseService.define()` handles execution; subclasses only describe requests                                                                               |
| **Open/Closed**                       | New service = new class + one line in `services/index.ts`. New placeholder = `TemplateEngine.register()`                                                  |
| **Fail-fast validation**              | Profile validation, unknown operations, placeholders and SLA metrics throw clear errors                                                                   |
| **Config over code**                  | Environments, profiles, thresholds and credentials all live outside the code                                                                              |
| **Resilience**                        | `ApiClient` never throws, so failures are recorded as samples. A circuit breaker aborts runaway tests                                                     |
| **Strict typing & quality gates**     | `strict` TS, ESLint (type-only imports, no `any`), Prettier, unit tests, CI                                                                               |

---

## Writing scenarios

### Step catalogue

**Pre-conditions & profile**

- `Given the API under test is healthy`
- `Given the "load" load profile`: a named profile from `config/load-profiles.json` (smoke, load, stress, spike, soak)
- `Given 10 virtual users for 30s`
- `Given a ramp-up of 5s` · `Given a think time of 200ms`
- `Given each virtual user performs 50 iterations`: iteration-based instead of duration-based
- `Given the load profile is customised with:` with a table of `virtualUsers | duration | rampUp | thinkTime | thinkTimeJitter | iterations`
- `Given each virtual user first executes "auth.login"`: per-VU setup, also recorded in the metrics
- `Given the request payload template "users/create-user.json"`: for ad-hoc endpoints
- `Given the expected response status is 201`: for ad-hoc endpoints
- `Given the test aborts when the error rate exceeds 25%`: circuit breaker
- `Given requests are authenticated with the bearer token from "ENV_VAR_NAME"`: scenario-specific token
- `Given requests are sent without authentication`: negative or security checks

**Execution**

- `When virtual users execute "users.list"`: a registered operation
- `When virtual users execute "GET /api/products/search?q=laptop"`: an ad-hoc endpoint, with no service class needed
- `When virtual users execute the weighted operation mix:` with a table of `operation | weight`
- `When virtual users execute the user journey:` with a table of `operation`, run in order for every iteration

**SLA assertions**

- `Then the error rate should be at most 1%`
- `Then the p95 response time should be below 500 ms` (min, max, mean, median, p90, p95, p99)
- `Then the "orders.create" p99 response time should be below 900 ms`
- `Then the throughput should be at least 50 requests per second`
- `Then at least 1000 requests should have been sent`
- `Then the following SLA thresholds should be met:` with a table of `metric | operator | value | operation`
- `Then the environment SLA thresholds should be met`: uses `defaultThresholds` from the environment JSON

### Tags

`@smoke @load @stress @spike @journey` select suites. Domain tags (`@users @products @orders`) allow slicing. playwright-bdd special tags also work: `@fail` marks an expected failure (used by the SLA-breach demo), and `@skip`, `@only`, `@slow` and `@timeout:N` are supported too.

---

## Extending

**Add an API domain.** Create `src/services/PaymentService.ts`:

```ts
export class PaymentService extends BaseService {
  protected readonly namespace = 'payments';
  operations(): Operation[] {
    return [
      this.define({
        name: 'authorise',
        expectedStatus: 201,
        request: (vu) =>
          RequestBuilder.post('/api/payments')
            .withBearer(this.token(vu))
            .withBody(TestDataManager.payload('payments/authorise.json', vu))
            .build(),
      }),
    ];
  }
}
```

Then register it in `src/services/index.ts`. The step `When virtual users execute "payments.authorise"` now works in any feature file.

**Payload placeholders:** `{{uuid}}`, `{{email}}`, `{{randomInt:1:100}}`, `{{randomString:8}}`, `{{timestamp}}`, `{{isoDate}}`, `{{vu.id}}`, `{{vu.iteration}}`, `{{session.<key>}}`, `{{env.<VAR>}}`. A value that is a single numeric placeholder keeps its number type.

**Datasets / feeders:** `TestDataManager.feeder('users', 'per-user' | 'sequential' | 'random')`.

**Add an environment:** drop `config/environments/<name>.json` (URL, headers, auth, thresholds) and run with `TEST_ENV=<name>`. The bundled mock server starts automatically whenever `baseUrl` points at localhost.

---

## Reports

| Output                                                        | Location                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------- |
| Consolidated performance dashboard (HTML)                     | `reports/performance/index.html`                         |
| Combined machine-readable summary                             | `reports/performance/summary.json`                       |
| Per-scenario HTML/JSON                                        | `reports/performance/scenarios/`                         |
| Playwright HTML report, with performance attachments per test | `reports/playwright-html/`                               |
| JUnit (for CI test tabs) / JSON                               | `reports/junit/results.xml`, `reports/json/results.json` |

Each scenario reports the total requests, throughput, error rate, latency (min, mean, p50, p90, p95, p99, max and std-dev), a per-operation breakdown, the status-code distribution, the top errors, the SLA results, and a per-second timeline of throughput, active users and latency.

---

## CI

`.github/workflows/performance.yml` runs these jobs:

- `verify`: type-check, lint, format check and unit tests
- `performance`: smoke on PRs, `@load` nightly, or any tag, environment or VU multiplier on manual dispatch. Reports are uploaded as artefacts.

---

## POC scope & known limitations

- **Closed workload model** (a fixed number of VUs with think time). An open model with a fixed arrival rate (RPS-based) is a natural next step for `LoadEngine`.
- Latency is measured client-side around `APIRequestContext.fetch`, so it includes a small Playwright IPC overhead (around 1–3 ms). That is fine for comparisons and SLA trends, but don't treat it as a network-level metric.
- Samples are kept in memory, which suits runs up to a few million requests. For long soak tests, replace `MetricsCollector` with a streaming or HDR-histogram implementation behind the same interface.
- Load is generated from a single Node process. For very high throughput, shard with `--shard` across CI agents and merge the `summary.json` files, or move to a distributed runner.
- `qa` and `staging` environment files use placeholder `example.com` hosts. Point them at real services only with the owning team's approval.
