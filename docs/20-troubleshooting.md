# Troubleshooting

Use this guide before weakening a threshold, increasing timeouts or bypassing readiness.

## `mise` / toolchain problems

### `mise: command not found`

Install `mise`, then run:

```bash
mise install
```

The repository pins Node.js and k6. Avoid debugging behavior with an arbitrary global k6 version before reproducing it with the pinned toolchain.

### k6 version mismatch

```bash
mise exec -- k6 version
```

Compare it with `mise.toml` and CI.

## Readiness is `BLOCKED`

This is normally a data/configuration result, not a framework failure.

Check:

- missing/low-confidence discovery profile;
- malformed plan units;
- PRD/TEST capacity mismatch;
- missing observability requirements;
- unsupported objective/scenario inputs.

Read `artifacts/readiness/readiness-report.md` before changing the plan.

## Discovery profile looks too high

Check whether an exceptional event is dominating the distribution.

The engine surfaces exceptional intervals for review. Do not silently treat a campaign, incident or one-off event as normal baseline demand.

For access logs, verify the exported time window includes idle intervals; omitting zero-traffic buckets can bias percentiles upward.

## Smoke has too few samples

Expected. Smoke is intentionally small.

Apdex may be displayed but remain informational until `APDEX_MIN_SAMPLES` is reached. Do not lower the Apdex floor simply to make a tiny sample pass.

Likewise, post-test RCA inference may be suppressed when the minimum matched-bucket requirement is not met.

## Correlation report has no hypotheses

Possible reasons:

- the run is too short;
- telemetry is synthetic (operational hypotheses are intentionally suppressed);
- the correlation is weak;
- the correlation has the wrong expected direction;
- a required threshold was not exceeded;
- telemetry has missing buckets;
- the real bottleneck is represented by a signal you did not collect.

"No hypothesis" is safer than manufacturing a cause from weak evidence.

## A signal has a large absolute `r` but is ignored

This can be correct.

Example: CPU vs latency `r=-0.82` does not support "CPU saturation caused latency" because the expected relationship is positive, and CPU saturation should also have independent resource evidence.

The engine considers direction and role semantics instead of ranking absolute correlations only.

## Prometheus real-observability path fails

`mise run observability` and `mise run full-validation` require Docker.

Check:

```bash
docker version
docker ps
```

Then inspect:

```text
artifacts/observability/prometheus.log
artifacts/observability/lab.log
artifacts/observability/observability-validation.md
```

The local Prometheus path is intentionally separate from normal `ci-smoke`; Docker should not be required for the basic learning path.

## Prometheus has no samples

Verify:

- lab is healthy on the expected local port;
- `/metrics` responds;
- Prometheus target is `UP`;
- scrape interval/time window overlaps the exact k6 run;
- the query name matches the exposed metric;
- Docker host-gateway works on the local platform.

Do not replace a failing real telemetry path with synthetic data and still call it real observability validation.

## Experiment returns `INCONCLUSIVE`

That is a legitimate result.

Check:

- effect size may be below the configured materiality floor;
- noise/jitter may dominate;
- too few trials;
- intervention may not actually influence the selected metric;
- control and treatment may not share the same workload/environment.

Do not lower every threshold until the experiment becomes `SUPPORTED`.

## Experiment returns `CONTRADICTED`

Treat it as useful evidence against the hypothesis under the tested conditions.

Next actions can include:

- review the mechanism;
- inspect different telemetry/traces;
- formulate a new hypothesis explicitly;
- design a new one-variable experiment.

## Evidence chain is `MISMATCH`

A `MISMATCH` means the observational telemetry path and experimental path do not agree on the technical role.

Do not combine the strongest statement from each report into a fake coherent story. Investigate why the evidence diverged.

## CI failed but artifact exists

This is intentional. Evidence upload occurs before the final quality gate so failed runs remain diagnosable.

Download the performance evidence artifact and start with:

```text
performance-diagnosis.md
readiness/readiness-report.md
correlation/telemetry-correlation.md
observability/observability-validation.md
observability/evidence-chain.md
```

Not every artifact exists for every failure mode; earlier blockers can prevent later stages.

## Before opening an issue

Run:

```bash
mise run release-qc
mise run test
```

Include:

- command used;
- OS/runner;
- pinned Node/k6 versions;
- relevant report/log excerpt;
- whether the target is the repository lab or an external authorized system;
- expected vs observed behavior.

Never include tokens, Datadog keys, Prometheus credentials or other secrets.
