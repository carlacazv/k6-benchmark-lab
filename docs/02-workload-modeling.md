# 2. Model baseline, peak, headroom and the exploration ceiling

Start with **observed production telemetry**, not VUs. The preferred order is:

1. API gateway/load-balancer/APM transaction rate for the exact operation being tested.
2. Access logs aggregated into operations per second/minute.
3. Business-event counters such as checkout/search/login events.
4. A business estimate only when telemetry does not exist.

For telemetry, inspect representative normal days plus known busy windows. Keep the operation dimension: a global service RPS can hide one hot endpoint. Record both a normal steady window and a real busy-hour/peak window.

## Business estimate fallback

If telemetry is unavailable, estimate arrival rate from behavior:

`iterations_per_second = active_users * operations_per_user / observation_window_seconds`

Example: 1,000 active users performing 3 searches during 10 minutes gives `1000 * 3 / 600 = 5` search operations/s.

This formula is valid only if **one k6 iteration represents the same operation**. A browser iteration may produce dozens of HTTP requests, so do not call browser network RPS the same thing as business transaction rate.

## Four different numbers

- **Baseline**: healthy steady-state arrival rate used to establish the normal latency/resource signature.
- **Observed peak**: real peak from telemetry, or a documented forecast when observation is impossible.
- **Design peak**: observed peak plus an agreed headroom. Headroom is a business/capacity decision, not a universal 20% rule.
- **Breakpoint exploration ceiling**: a safety ceiling for a controlled breakpoint experiment. It is **not** the system limit. The actual breakpoint is discovered when an NFR, safety guardrail or resource boundary is consistently violated.

The readiness engine derives these values from `performance-test-plan.yaml` and records whether baseline/peak were observed or estimated.

## Scaled test environments

If TEST has less CPU/memory than PRD, do not send full production traffic and pretend the result predicts PRD. In `comparisonMode: scaled`, the engine scales the planned arrival rates by the smaller CPU/memory capacity ratio and flags configuration differences. Capacity does not always scale linearly, so the result remains an experiment, not a mathematical proof of production capacity.

## Why arrival-rate executors

When throughput/transaction arrival is the contract, prefer an open workload model. k6 arrival-rate executors start iterations independently of SUT response time, reducing coordinated omission. Track `dropped_iterations`: they can indicate insufficient VU allocation or SUT degradation. Use the readiness VU estimate only as a starting point and recalibrate after a trial run using observed iteration duration, `vus_max` and dropped iterations.
