# 11. Telemetry adapters

All adapters normalize source data to `{ timestamp, value }`, where value is the arrival rate of the same business operation represented by one k6 iteration.

## File

Use exported or curated time series. JSON may be an array or `{ "series": [...] }`. Configure `timestampField` and `valueField`. This is also the safe integration path for CloudWatch exports when direct AWS API authentication is not configured in the lab.

## Access log

Use NDJSON request logs when no metrics backend is available. Each matching log line is counted into the configured time bucket and divided by bucket seconds. Optional `operationFilterField`/`operationFilterValue` isolates the business operation under test.

## Prometheus-compatible / Grafana Cloud

The adapter performs a Prometheus range query and sums returned series by timestamp. Write the PromQL so the result already represents the business arrival rate, for example an aggregate `rate()` over a request counter.

Authentication modes are `none`, `bearer` and `basic`. Grafana Cloud Metrics exposes Prometheus-compatible query endpoints and can use the same adapter. Mimir/Thanos-compatible backends can also work when they implement the same query API.

## Datadog

The Datadog adapter queries the metrics timeseries API with `from`, `to` and a Datadog metric query. `DD_API_KEY` and `DD_APP_KEY` (or custom env names) are read only from environment variables. Returned series are summed by timestamp into the common rate model.

## OpenTelemetry

OpenTelemetry/OTLP is an instrumentation and transport standard, not treated here as a historical query database. Query the backend to which the Collector exports telemetry (for example Prometheus/Mimir/Datadog), rather than inventing an OTLP query adapter.

## Secrets

Never commit tokens, API keys or passwords to telemetry YAML. Store only env-variable names and inject secrets through CI/environment secret management.

## Synthetic (CI only)

The default repository config generates a deterministic 14-day series with daily seasonality and one exceptional event. It exists only to exercise discovery/readiness in CI and is always marked as synthetic evidence. Replace it with a real adapter before making production capacity claims.
