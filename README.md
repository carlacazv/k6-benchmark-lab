# k6 Benchmark Lab

A performance-engineering learning lab for QAs who need to discover production demand, design safe tests, execute k6 workloads and diagnose results with evidence instead of guesswork.

## Engineering workflow

1. Discover production workload from telemetry (`mise run discover`).
2. Review data quality, baseline/peak percentiles, busy periods and exceptional events.
3. Define or confirm non-functional acceptance criteria.
4. Let the readiness engine consume the discovery profile, compare PRD vs TEST and recommend the scenario.
5. Execute REST, GraphQL or browser adapters only after the readiness gate passes.
6. Analyze p95/p99, errors, throughput, dropped iterations, Apdex and Core Web Vitals.
7. Correlate hypotheses with application/infrastructure telemetry.
8. Preserve discovery, readiness, raw summaries, diagnosis and environment facts as CI evidence.

Read `docs/` in numeric order before running anything above smoke.

## Quick start

```bash
mise install
mise run discover
mise run readiness
mise run lab             # terminal 1
mise run ci-smoke        # terminal 2, safe end-to-end path
```

Or let the plan choose the scenario after discovery: `mise run suite`.

## Phase 3: Telemetry & Capacity Intelligence

`telemetry-discovery.yaml` describes how to obtain an arrival-rate time series. Supported adapters:

- `synthetic`: deterministic CI-only evidence;
- `file`: normalized exported time series (also useful for exported CloudWatch/APM data);
- `access-log`: NDJSON request logs aggregated into operations/second;
- `prometheus`: Prometheus-compatible query API, including Grafana Cloud Metrics/Mimir-compatible backends;
- `datadog`: Datadog metrics timeseries query API.

OpenTelemetry is handled at the storage backend: OTLP/Collector exports data to an observability backend, then the corresponding query adapter reads the historical series.

Discovery writes `workload-profile.json`, `workload-profile.md` and `plan-volume-suggestion.yaml`. The profile includes coverage/confidence, p50/p75/p95/p99/max, busiest UTC hours, volatility, exceptional intervals and recommended baseline/observed peak. Exceptional events are surfaced for human review and are not silently promoted into the normal capacity requirement.

## Discovery feeds readiness

```yaml
volume:
  discoveryProfile: artifacts/discovery/workload-profile.json
  discoveryRequired: true
  discoveryMinimumConfidence: MEDIUM
```

When loaded, discovered baseline/peak supersede manual fallback values. Non-smoke execution is blocked when a required profile is missing, incompatible, malformed or below the configured confidence floor.

## Credentials

Telemetry config stores only names of credential env vars, never secret values. Prometheus supports `none`, `bearer` and `basic`; Datadog uses API/application keys from env vars.

## Safe default

PR/push pipelines still execute only `smoke`, even if the objective recommends `load`. Manual `workflow_dispatch` can select `auto` after discovery/readiness. Aggressive tests belong only on infrastructure you own or are explicitly authorized to test.

## Architecture

```text
Telemetry adapters -> Production profiler -> Workload profile
                                      |
                                      v
Performance plan -> Readiness policy engine -> Runtime env -> k6 adapters
                                                     |
                                                     v
                                               Diagnosis/evidence
```

The project remains Ports & Adapters + Strategy. Saga remains intentionally out of scope.

## CI evidence

GitHub Actions uploads telemetry discovery profile, readiness Markdown/JSON/runtime env, raw k6 summaries, diagnosis Markdown/JSON and runner/target evidence. Failures still leave artifacts explaining why the run failed or was blocked.
