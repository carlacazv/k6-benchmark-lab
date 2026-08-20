# k6 Benchmark Lab

A performance-engineering learning lab for QAs who need to discover production demand, design safe tests, execute k6 workloads and diagnose results with evidence instead of guesswork.

## Engineering workflow

1. Discover production workload from telemetry (`mise run discover`).
2. Review data quality, baseline/peak percentiles, busy periods and exceptional events.
3. Define or confirm non-functional acceptance criteria.
4. Let the readiness engine consume the discovery profile, compare PRD vs TEST and recommend the scenario.
5. Execute REST, GraphQL or browser adapters only after the readiness gate passes.
6. Capture granular k6 points plus the exact UTC test window.
7. Query application/infrastructure telemetry for the same window with pre/post padding.
8. Compare pre/during/post behavior and compute time-aligned/lagged correlations.
9. Produce evidence-backed bottleneck hypotheses.
10. Validate selected hypotheses with paired controlled experiments that change one variable at a time.
11. Classify experimental evidence as `SUPPORTED`, `CONTRADICTED` or `INCONCLUSIVE` without claiming causal proof.
12. Validate the same reasoning path against real Prometheus telemetry in the owned lab.
13. Align the real telemetry hypothesis with the separate experiment as `ALIGNED`, `PARTIAL` or `MISMATCH`.
14. Preserve discovery, readiness, raw k6, telemetry correlation, diagnosis, experiment, observability and environment facts as CI evidence.

Read `docs/` in numeric order before running anything above smoke.

## Quick start

```bash
mise install
mise run discover
mise run readiness
mise run lab             # terminal 1
mise run ci-smoke        # terminal 2, safe path without Docker observability
```

Or let the plan choose the scenario after discovery: `mise run suite`.

For the full owned-lab evidence chain, Docker is required:

```bash
mise run full-validation
```

## Phase 3: Telemetry & Capacity Intelligence

`telemetry-discovery.yaml` describes how to obtain an arrival-rate time series. Supported adapters:

- `synthetic`: deterministic CI-only evidence;
- `file`: normalized exported time series (also useful for exported CloudWatch/APM data);
- `access-log`: NDJSON request logs aggregated into operations/second;
- `prometheus`: Prometheus-compatible query API, including Grafana Cloud Metrics/Mimir-compatible backends;
- `datadog`: Datadog metrics timeseries query API.

OpenTelemetry is handled at the storage backend: OTLP/Collector exports data to an observability backend, then the corresponding query adapter reads the historical series.

Discovery writes `workload-profile.json`, `workload-profile.md` and `plan-volume-suggestion.yaml`. The profile includes coverage/confidence, p50/p75/p95/p99/max, busiest UTC hours, volatility, exceptional intervals and recommended baseline/observed peak. Exceptional events are surfaced for human review and are not silently promoted into the normal capacity requirement.

## Phase 4: Post-Test Telemetry Correlation

Every k6 adapter runs through `scripts/run-k6-with-window.mjs`. Besides the existing `summary.json`, it records:

- `timeseries.json`: granular k6 points with timestamps;
- `test-window.json`: exact UTC start/end, protocol, scenario, target and exit code.

`mise run correlate` reads those artifacts and `telemetry-correlation.yaml`, queries the matching telemetry window and writes:

- `artifacts/correlation/telemetry-correlation.md`
- `artifacts/correlation/telemetry-correlation.json`

Supported post-test sources:

- `synthetic`: deterministic CI-only correlation evidence;
- `prometheus`: one range query per configured signal;
- `datadog`: one timeseries query per configured signal;
- `file`: exported historical telemetry.

The engine compares pre-test, during-test and post-test behavior; evaluates threshold overlap; computes Pearson correlation with latency/error/iteration rate; searches configured lag buckets; and emits diagnostic hypotheses for roles such as CPU, memory, DB pool/wait, dependency latency, cache hit ratio and autoscaling replicas.

**Correlation is never labelled root cause.** The report always keeps hypotheses separate from causal proof.

## Phase 5: Controlled Experiments & RCA Validation

Phase 5 turns a hypothesis into a paired experiment:

```text
same workload
    |
    +--> control -----------+
    |                       |
    +--> one-variable treatment
                            |
                            v
              paired deltas + repeated trials
                            |
                            v
        SUPPORTED / CONTRADICTED / INCONCLUSIVE
```

The local lab exposes controlled knobs for base latency, simulated downstream latency, simulated DB wait, CPU work and error probability. Experiment plans live in `experiments/`.

Run the default dependency-latency experiment:

```bash
mise run experiment
```

The runner executes at least three paired trials, alternates AB/BA order, keeps workload constant, evaluates both absolute and relative materiality and requires repeated directional consistency. `SUPPORTED` means the controlled intervention repeatedly produced the expected effect **under this lab workload**; it does not mean production causality is proven.

The experiment runner rejects remote targets and arbitrary environment variables. Fault injection is limited to the repository-owned local lab with explicit intensity, VU, iteration and duration ceilings.

See `docs/15-controlled-experiments.md`.

## Phase 6: Real Observability Validation

Phase 6 removes synthetic telemetry from the RCA-validation path. The CI starts a real Prometheus container, which scrapes the owned Node lab every second. The existing Prometheus `query_range` adapter then correlates those real samples with a dedicated 24-second k6 run.

The observability run deliberately uses a temporal profile:

```text
0s              6s                16s                 24s
| baseline 0 ms | dependency +120 | recovery 0 ms     |
```

This creates temporal variance inside one exact k6 window. The correlation engine must independently produce a `dependency_latency_ms` hypothesis from Prometheus data; synthetic telemetry cannot satisfy this gate.

After that, the separate Phase 5 paired experiment executes. The evidence-chain gate classifies the relationship as:

- `ALIGNED`: real Prometheus hypothesis matches the technical role independently supported by the experiment;
- `MISMATCH`: the experiment is supported but the real telemetry hypothesis points elsewhere or is missing;
- `PARTIAL`: the evidence is incomplete or inconclusive.

Run only the real Prometheus path:

```bash
mise run observability
```

Run the complete chain locally:

```bash
mise run full-validation
```

Both require Docker. Ordinary smoke/suite commands keep their previous Docker-free behavior.

See `docs/16-real-observability-validation.md`.

## Discovery feeds readiness

```yaml
volume:
  discoveryProfile: artifacts/discovery/workload-profile.json
  discoveryRequired: true
  discoveryMinimumConfidence: MEDIUM
```

When loaded, discovered baseline/peak supersede manual fallback values. Non-smoke execution is blocked when a required profile is missing, incompatible, malformed or below the configured confidence floor.

## Correlation configuration

```yaml
analysis:
  bucketSeconds: 5
  minimumMatchedBuckets: 12
  strongCorrelation: 0.65
  maxLagBuckets: 6

signals:
  cpu:
    role: cpu_utilization
    unit: ratio
    threshold: 0.85
    query: YOUR_PROVIDER_QUERY
```

The signal `role` drives diagnostic meaning; the provider-specific query stays configurable.

For Prometheus/Datadog, `seriesAggregation` supports `sum|avg|max|min`. This matters when a query returns one series per pod/host.

## Credentials

Telemetry configs store only names of credential env vars, never secret values. Prometheus supports `none`, `bearer` and `basic`; Datadog uses API/application keys from env vars.

The local Phase 6 Prometheus instance uses no credentials because it binds only to the CI/local loopback path and scrapes the repository-owned lab.

## Safe default

PR/push performance scenarios still execute only `smoke`, even if the objective recommends `load`. Manual `workflow_dispatch` can select `auto` after discovery/readiness. Aggressive tests belong only on infrastructure you own or are explicitly authorized to test.

The Phase 5 CI experiment is a separate short local-only validation. Its treatment is intentionally degraded, so its measurement workload does not use performance NFR thresholds; the gate validates experimental integrity and the known expected classification instead.

The Phase 6 observability workload is also local-only. It creates a bounded dependency-latency pulse solely to provide real temporal telemetry for the correlation engine; it never targets a remote system.

A smoke run can collect correlation evidence but may legitimately report that there are too few matched buckets for a statistical claim. Longer baseline/load/stress/soak runs are where temporal diagnosis becomes useful.

## Architecture

```text
Production telemetry -> Workload discovery -> Workload profile
                                            |
                                            v
Performance plan -> Readiness policy -> Runtime env -> k6
                                                   |
                                                   +--> granular k6 time series + exact window
                                                                  |
                                                                  v
Post-test telemetry query -> time alignment -> correlation/lag -> RCA hypotheses
                                                                  |
                            +-------------------------------------+
                            |
                            v
                  real Prometheus lab validation
                            |
                            v
                  separate controlled experiment
                   control / treatment / repeats
                            |
                            v
             ALIGNED / PARTIAL / MISMATCH evidence chain
                            |
                            v
                         CI evidence
```

The project remains Ports & Adapters + Strategy. Saga remains intentionally out of scope.

## CI evidence

GitHub Actions uploads:

- telemetry discovery profile;
- readiness Markdown/JSON/runtime env;
- per-protocol `summary.json`, `timeseries.json` and `test-window.json`;
- synthetic and real-Prometheus post-test correlation Markdown/JSON;
- performance diagnosis Markdown/JSON;
- controlled experiment plans, per-trial summaries/logs and experiment report;
- Prometheus/lab logs and before/after observability configs;
- observability validation Markdown/JSON;
- final evidence-chain Markdown/JSON;
- runner/target evidence.

Failures still leave artifacts explaining why the run failed or was blocked.
