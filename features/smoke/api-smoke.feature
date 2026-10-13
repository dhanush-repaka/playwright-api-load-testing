@smoke
Feature: API smoke performance
  As a performance engineer
  I want a fast, low-load check of every critical endpoint
  So that broken scripts or endpoints are caught before heavier tests run

  Background:
    Given the API under test is healthy
    And the "smoke" load profile

  Scenario Outline: Smoke check - <operation>
    Given each virtual user performs 5 iterations
    When virtual users execute "<operation>"
    Then the error rate should be at most 0%
    And the p95 response time should be below <p95> ms

    Examples:
      | operation        | p95 |
      | health.check     | 300 |
      | users.list       | 500 |
      | users.create     | 500 |
      | products.list    | 500 |
      | products.search  | 500 |
      | products.getById | 500 |

  Scenario: Smoke check - authenticated order placement
    Given each virtual user first executes "auth.login"
    And each virtual user performs 3 iterations
    When virtual users execute "orders.create"
    Then the error rate should be at most 0%
    And the environment SLA thresholds should be met
