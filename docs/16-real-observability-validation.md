# Phase 6 — Real Observability Validation

Phase 4 proved the correlation plumbing with deterministic synthetic telemetry. Phase 5 proved that a controlled intervention can support, contradict or leave an RCA hypothesis inconclusive. Phase 6 connects those two evidence layers with **real metrics scraped from the running lab by Prometheus**.

## Question this phase answers

Can the framework observe a real system signal during a k6 run, generate the correct bottleneck hypothesis without reading the experiment answer, and then align that hypothesis with a separate controlled experiment?

The expected evidence chain is:

```text
k6 client latency
      |
      v
owned lab application ----> /metrics ----> Prometheus
      |                                     |
      |                                     v
      |                              query_range adapter
      |                                     |
      +---------------------------> correlation + lag
                                            |
                                            v
                                   RCA hypothesis only
                                            |
                                            v
                              separate Phase 5 experiment
                                            |
                                            v
                                  ALIGNED | PARTIAL | MISMATCH
```

## Real telemetry, not synthetic correlation

The Phase 6 CI path starts a real Prometheus process in Docker and scrapes the lab every second. The correlation config uses `source.type: prometheus`, so the existing Prometheus adapter queries `/api/v1/query_range` exactly as it would for a Prometheus-compatible backend.

The lab exposes:

- `lab_dependency_latency_milliseconds`
- `lab_db_wait_milliseconds`
- `lab_event_loop_utilization_ratio`
- `process_cpu_user_seconds_total`
- `process_cpu_system_seconds_total`
- `process_resident_memory_bytes`
- request/error/activity counters and request-duration summary data

Because the source is real Prometheus telemetry, `synthetic=false` and operational hypothesis generation is allowed only when the existing minimum matched-bucket policy is satisfied.

## Why the dependency latency changes inside one run

A constant signal cannot explain temporal covariance. If dependency latency were 120 ms for the entire run, latency could be high while the dependency gauge stayed flat, which is poor evidence for a correlation engine.

The lab therefore supports a workload-relative pulse:

```text
0s              6s                16s                 24s
| baseline 0 ms | treatment 120 ms | recovery 0 ms     |
```

The pulse starts relative to the **first business request**, not process startup. Prometheus can collect clean pre-test samples while the lab is healthy, then observe the treatment and recovery during the exact k6 window.

The static Phase 5 behavior remains unchanged when `LAB_DEPENDENCY_LATENCY_DURATION_MS=0`.

## Correlation policy

`observability-correlation.yaml` uses one-second buckets and requires at least 12 matched buckets. The CI validation requires all of the following:

1. correlation collection succeeded;
2. source is Prometheus and not synthetic;
3. operational inference is allowed by the correlation engine;
4. `dependencyLatency` has a positive latency correlation at or above the configured strong-correlation floor;
5. the report emits a `dependency_latency_ms` hypothesis.

The validator does **not** accept a green Prometheus process alone as success.

## Independent experiment alignment

After the real observability run, the existing paired Phase 5 dependency-latency experiment executes separately. `scripts/validate-evidence-chain.mjs` then maps the experiment intervention to the telemetry role and classifies the chain:

- `ALIGNED`: real Prometheus telemetry produced a matching hypothesis and the separate experiment is `SUPPORTED`;
- `MISMATCH`: the experiment is `SUPPORTED`, but real telemetry did not produce the matching role hypothesis;
- `PARTIAL`: evidence is incomplete, synthetic, or the experiment is not `SUPPORTED`.

`ALIGNED` is still not called proof. It means two independent evidence paths agree **inside the controlled lab**.

## Run locally

Docker is required only for the real Prometheus path.

```bash
mise install
mise run experiment
mise run observability
mise run validate-chain
```

Or run the full safe validation path:

```bash
mise run full-validation
```

The ordinary `mise run suite` and `mise run ci-smoke` do not silently require Docker. Set `RUN_REAL_OBSERVABILITY=1` only when you explicitly want the Prometheus path.

## Artifacts

Phase 6 adds:

```text
artifacts/observability/
├── k6/
│   ├── summary.json
│   ├── timeseries.json
│   └── test-window.json
├── correlation/
│   ├── telemetry-correlation.json
│   └── telemetry-correlation.md
├── lab-config-before.json
├── lab-config-after.json
├── lab.log
├── prometheus.log
├── observability-validation.json
├── observability-validation.md
├── evidence-chain.json
└── evidence-chain.md
```

Failures still preserve the available evidence so a failed validation can be diagnosed rather than retried blindly.

## What this does not prove

This phase demonstrates that the model can close the evidence loop in an owned, deterministic system. It does not establish that the same correlation is causal in production, that the lab reproduces production architecture, or that one observed metric is sufficient without traces/logs/context.

A production investigation should still combine workload evidence, infrastructure/application metrics, logs/traces, architectural knowledge and controlled changes where safe and authorized.

OpenTelemetry remains compatible with the model as a telemetry transport/export path; the historical query still belongs to the backend that stores the telemetry. Phase 6 uses Prometheus directly so the lab can validate the historical-query adapter with real collected samples.
