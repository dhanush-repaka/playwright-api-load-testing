@spike
Feature: Spike testing
  Sudden bursts (flash sale, marketing push) with no ramp-up.

  Scenario: Flash-sale spike on product details
    Given the API under test is healthy
    And the "spike" load profile
    And the load profile is customised with:
      | virtualUsers | 50  |
      | duration     | 8s  |
    When virtual users execute "products.getById"
    Then the error rate should be at most 2%
    And the p95 response time should be below 800 ms
    And at least 200 requests should have been sent
