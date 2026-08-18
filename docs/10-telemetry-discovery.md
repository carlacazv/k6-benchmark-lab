# 10. Discover workload from production telemetry

Performance demand should be derived from observed production behavior whenever possible, not guessed from virtual users.

`mise run discover` converts a rate time series into a versioned workload profile. By default the lab uses p75 as the normal baseline and p99 as the observed peak. These percentiles are configurable; they are engineering defaults for the lab, not universal standards.

The profile records source/provenance, actual time span and sample coverage, mean/p50/p75/p95/p99/max, coefficient of variation, busiest UTC hours and weekday patterns, robust exceptional-event detection, recommended baseline/observed peak, and confidence/data-quality warnings.

## Why max is not the default peak

A single maximum can be a campaign, retry storm, incident or instrumentation anomaly. The profiler therefore uses a high percentile for the normal observed peak and reports statistically exceptional intervals separately. A human must decide whether an exceptional business event belongs in the capacity requirement.

## Confidence

- **HIGH**: strong coverage, enough samples and at least a weekly span.
- **MEDIUM**: usable but incomplete evidence.
- **LOW**: insufficient evidence for automatic non-smoke workload selection unless the plan explicitly accepts that risk.

The profile is evidence, not an NFR. Forecasts and business commitments still matter.
