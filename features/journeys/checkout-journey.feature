@journey @load @orders
Feature: End-to-end checkout journey
  Each virtual user logs in once, then repeatedly browses, views a product,
  places an order and checks its status - data flows between steps via the
  virtual user's session (product id -> order id).

  Scenario Outline: Checkout journey with <vus> concurrent shoppers
    Given the API under test is healthy
    And the "load" load profile
    And <vus> virtual users for <duration>
    And a ramp-up of 2s
    And a think time of 100ms
    And each virtual user first executes "auth.login"
    When virtual users execute the user journey:
      | operation        |
      | products.list    |
      | products.getById |
      | orders.create    |
      | orders.getById   |
    Then the following SLA thresholds should be met:
      | metric    | operator | value | operation     |
      | errorRate | <=       | 1     |               |
      | p95       | <        | 600   |               |
      | p95       | <        | 700   | orders.create |
      | errorRate | ==       | 0     | auth.login    |

    Examples:
      | vus | duration |
      | 5   | 10s      |
      | 10  | 10s      |
