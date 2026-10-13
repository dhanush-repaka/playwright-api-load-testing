@stress
Feature: Stress testing beyond expected peak
  Push the system past normal capacity to observe degradation behaviour.

  Scenario: Catalogue under stress with circuit breaker
    Given the API under test is healthy
    And the "stress" load profile
    And the load profile is customised with:
      | virtualUsers | 40  |
      | duration     | 15s |
      | rampUp       | 5s  |
      | thinkTime    | 10ms|
    And the test aborts when the error rate exceeds 25%
    When virtual users execute the weighted operation mix:
      | operation       | weight |
      | products.list   | 50     |
      | products.search | 30     |
      | users.list      | 20     |
    Then the error rate should be at most 5%
    And the p99 response time should be below 1500 ms

  @fail @sla-breach-demo
  Scenario: Heavy reporting endpoint breaches latency SLA (expected failure - demonstrates SLA breach reporting)
    Given 5 virtual users for 6s
    When virtual users execute "GET /api/reports/heavy?ms=600"
    Then the error rate should be at most 0%
    And the p95 response time should be below 500 ms
