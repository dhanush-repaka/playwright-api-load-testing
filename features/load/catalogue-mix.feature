@load @products
Feature: Product catalogue realistic traffic mix
  Production analytics show browsing dominates search, which dominates
  product detail views. The test reproduces that ratio with weights.

  Scenario: Weighted catalogue browsing traffic
    Given the API under test is healthy
    And the "load" load profile
    And the load profile is customised with:
      | virtualUsers | 15    |
      | duration     | 12s   |
      | rampUp       | 3s    |
      | thinkTime    | 50ms  |
    When virtual users execute the weighted operation mix:
      | operation        | weight |
      | products.list    | 60     |
      | products.search  | 30     |
      | products.getById | 10     |
    Then the error rate should be at most 1%
    And the p95 response time should be below 500 ms
    And the "products.search" p95 response time should be below 500 ms
    And the throughput should be at least 30 requests per second

  Scenario: Ad-hoc endpoint without a service class
    Given the "load" load profile
    And 5 virtual users for 6s
    And a ramp-up of 1s
    And the expected response status is 200
    When virtual users execute "GET /api/products/search?q=laptop"
    Then the error rate should be at most 0%
    And the p95 response time should be below 400 ms
