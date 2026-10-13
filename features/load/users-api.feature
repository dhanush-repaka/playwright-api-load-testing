@load @users
Feature: Users API under expected load
  The Users API must sustain normal business traffic within SLA.

  Background:
    Given the API under test is healthy

  Scenario Outline: <operation> sustains <vus> virtual users
    Given the "load" load profile
    And <vus> virtual users for <duration>
    And a ramp-up of <rampUp>
    And a think time of 50ms
    When virtual users execute "<operation>"
    Then the following SLA thresholds should be met:
      | metric        | operator | value     |
      | errorRate     | <=       | 1         |
      | p95           | <        | <p95>     |
      | p99           | <        | <p99>     |
      | throughput    | >=       | <minRps>  |

    Examples: Read endpoints
      | operation     | vus | duration | rampUp | p95 | p99  | minRps |
      | users.list    | 10  | 10s      | 2s     | 400 | 800  | 20     |
      | users.getById | 10  | 10s      | 2s     | 400 | 800  | 20     |

    Examples: Write endpoints
      | operation     | vus | duration | rampUp | p95 | p99  | minRps |
      | users.create  | 5   | 10s      | 2s     | 500 | 1000 | 10     |
