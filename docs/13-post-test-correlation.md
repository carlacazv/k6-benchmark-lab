# 13. Post-test telemetry correlation

Phase 4 aligns granular k6 samples with application/infrastructure telemetry from the exact test window.

## Why the end-of-test summary is not enough

`summary.json` is excellent for acceptance criteria, but it aggregates the whole test. Correlation needs timestamps. The wrapper `scripts/run-k6-with-window.mjs` therefore runs k6 with JSON output and writes:

- `timeseries.json`: granular k6 points with timestamps;
- `test-window.json`: exact UTC start/end, scenario, target and exit code;
- `summary.json`: the existing end-of-test summary.

The correlation engine never infers a test window from CI timestamps or file modification times.

## Workflow

```text
k6 granular time series + exact test window
                    |
                    v
      telemetry query with pre/post padding
                    |
                    v
     common time buckets + lag correlation
                    |
                    v
 pre / during / post resource comparison
                    |
                    v
 evidence-backed bottleneck hypotheses
```

Run it with:

```bash
mise run correlate
```

The engine writes:

- `artifacts/correlation/telemetry-correlation.md`
- `artifacts/correlation/telemetry-correlation.json`

## Supported telemetry sources

- `synthetic`: CI-only deterministic evidence used to prove the framework.
- `prometheus`: Prometheus-compatible `/api/v1/query_range`, including compatible managed backends.
- `datadog`: Datadog metrics timeseries query API.
- `file`: exported normalized telemetry for providers that are not queried directly.

Secrets remain environment variables.

## Signal roles

The policy layer understands these roles:

- `cpu_utilization`
- `event_loop_utilization`
- `memory_utilization`
- `process_memory_bytes`
- `db_pool_utilization`
- `db_wait_ms`
- `dependency_latency_ms`
- `cache_hit_ratio`
- `replicas`
- `generic`

The metric name itself is provider-specific. The role gives the diagnostic rule its meaning.

## Aggregation matters

A provider can return one series per pod/host/instance. Do not always sum.

Examples:

- CPU utilization across replicas often wants `avg`;
- resident memory for total service footprint can use `sum`;
- replica count can use `sum`;
- worst queue/pool saturation may use `max`.

`seriesAggregation` supports `sum|avg|max|min` for Prometheus and Datadog query results.

## Time alignment and lag

The engine buckets k6 and telemetry at `analysis.bucketSeconds`, then evaluates Pearson correlation for configured lags.

A positive lag means the telemetry signal is strongest *after* the k6 metric. This is useful for autoscaling delay, queue buildup or memory growth. A negative lag can mean the telemetry signal leads the observed latency.

Lag correlation is still not causal proof.

## Data-quality rule

`analysis.minimumMatchedBuckets` protects against declaring a relationship from a tiny smoke test. A smoke pipeline may collect telemetry successfully yet report `insufficient evidence for correlation`. Longer baseline/load/stress/soak runs are where the diagnosis becomes statistically useful.
