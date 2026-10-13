@auth @smoke
Feature: Bearer token authentication under load
  Corporate APIs sit behind a gateway that requires a bearer token.
  By default every request carries the token configured for the environment
  (API_BEARER_TOKEN). Scenarios can switch to another token - for example a
  different role - or send no token at all to verify the API rejects it.

  Background:
    Given the API under test is healthy

  Scenario: Requests carry the environment's bearer token
    Given 3 virtual users for 4s
    When virtual users execute the weighted operation mix:
      | operation       | weight |
      | users.list      | 50     |
      | products.search | 50     |
    Then the error rate should be at most 0%
    And the p95 response time should be below 500 ms

  Scenario: A scenario-specific token (e.g. read-only role) is used
    Given requests are authenticated with the bearer token from "API_BEARER_TOKEN_READONLY"
    And 2 virtual users for 3s
    When virtual users execute "products.list"
    Then the error rate should be at most 0%

  Scenario: Requests without a token are rejected by the gateway
    Given requests are sent without authentication
    And 2 virtual users for 3s
    And the expected response status is 401
    When virtual users execute "GET /api/users"
    Then the error rate should be at most 0%
