# v1 Evidence Example — Real Observability + Controlled Experiment

This is a compact, versioned example of the evidence produced by the owned lab. It is intentionally smaller than the full GitHub Actions artifact.

**Context:** controlled local lab, dependency-latency mechanism known only to the fixture setup. These numbers are not production capacity claims.

## Observation run

- k6 duration: ~24 seconds
- time buckets: 25 × 1 second
- telemetry source: real local Prometheus
- synthetic: `false`
- operational RCA inference allowed: `yes`

The workload included three periods:

```text
baseline dependency latency = 0 ms
  -> treatment dependency latency = 120 ms
  -> recovery dependency latency = 0 ms
```

## Correlation evidence

| Signal | r(request latency) | Interpretation |
|---|---:|---|
| dependency latency | 0.973 | strong expected-direction relationship; hypothesis eligible |
| CPU utilization | -0.826 | strong absolute correlation but wrong direction; no CPU bottleneck hypothesis |
| event-loop utilization | 0.406 | below strong-correlation floor |
| process memory | 0.387 | no retention/leak evidence |
| DB wait | n/a / zero | no DB-wait hypothesis |

Dependency latency also showed:

- pre mean: `0 ms`;
- during mean: `48 ms`;
- during p95/max: `120 ms`;
- post mean: `0 ms`;
- best lag: `+1` bucket;
- matched buckets: `25`;
- hypothesis confidence: `HIGH`.

Generated hypothesis:

> Downstream dependency latency tracks application latency and is a plausible contributor.

Notice what is **not** claimed: "dependency latency is proven to be the production root cause."

## Separate controlled experiment

The independent paired experiment used:

- 3 trials;
- alternating control/treatment order;
- same 4-VU / 40-iteration workload per role;
- one changed variable: dependency latency `0 -> 120 ms`;
- zero HTTP failures.

Result:

- 3/3 trials: `SUPPORTED`;
- consistency: `100%`;
- median control p95: `17.364 ms`;
- median treatment p95: `137.800 ms`;
- aggregate delta: `+120.437 ms` / `+693.6%`.

## Evidence-chain result

```text
real Prometheus hypothesis role: dependency_latency_ms
controlled experiment result:   SUPPORTED
evidence-chain status:           ALIGNED
```

`ALIGNED` means the independent observational and experimental paths agree inside this controlled lab. External validity remains a separate question.

## What a QA should learn from this example

1. A large absolute correlation is not enough: CPU had `|r| > 0.8` and was correctly rejected because direction/context did not support the mechanism.
2. Exact time alignment matters: the dependency signal had a plausible +1-second lag.
3. A hypothesis is stronger when independently tested with one changed variable.
4. Controlled evidence still has scope: lab causal evidence is not automatically production causal evidence.
