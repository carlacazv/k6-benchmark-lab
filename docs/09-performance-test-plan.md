# 9. Performance test plan schema

The plan is intentionally a small YAML mapping so the QA must make test assumptions explicit and reviewable. The built-in parser supports nested mappings and scalar strings/numbers/booleans; lists are intentionally rejected to keep the executable contract narrow.

## Required sections for non-smoke execution

```yaml
target:
  baseUrl: https://test.example.internal
  authorized: true

objective:
  type: validate_expected_peak

volume:
  unit: iterations_per_second
  oneIterationModelsOneOperation: true
  observedBaselineRate: 80
  observedPeakRate: 220
  headroomPercent: 30
  explorationCeilingMultiplier: 2

environment:
  comparisonMode: equivalent
  minimumCapacityRatio: 0.8
  production:
    replicas: 8
    cpuCoresPerReplica: 2
    memoryMbPerReplica: 4096
  test:
    replicas: 8
    cpuCoresPerReplica: 2
    memoryMbPerReplica: 4096

observability:
  applicationMetrics: true
  infrastructureMetrics: true
  logs: true
  traces: true
  dependencyMetrics: true

nfr:
  p95Ms: 350
  p99Ms: 800
  errorRate: 0.005
  checkRate: 0.995
  apdexTMs: 350
  apdexMin: 0.9
```

When observed baseline is unavailable, replace it with `activeUsers`, `operationsPerUser` and `observationWindowSeconds`. The report will mark the baseline as estimated.

## Environment modes

`equivalent` means the team intends TEST to represent PRD capacity. `minimumCapacityRatio` is the team's explicit minimum, not a framework magic number.

`scaled` means TEST is intentionally smaller. The engine calculates total CPU and memory ratios, uses the smaller ratio to scale runtime arrival rates, and still warns about non-linear extrapolation/configuration differences. See `examples/scaled-performance-test-plan.yaml`.

## Secrets

Do not put API keys, passwords, bearer tokens or production credentials in this file. The plan captures test design facts. Secrets remain Twelve-Factor runtime configuration supplied by CI/environment variables.
