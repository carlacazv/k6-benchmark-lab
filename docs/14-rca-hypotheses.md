# 14. Evidence-based RCA hypotheses

The framework deliberately produces **hypotheses**, never automatic root-cause declarations.

## Evidence layers

A hypothesis can combine:

1. an NFR or k6 symptom (latency, errors, dropped iterations);
2. a resource/dependency guardrail crossing;
3. temporal correlation with the symptom;
4. lag direction;
5. pre-test vs during-test vs post-test behavior.

The strongest result is still a candidate explanation that must be validated with traces, logs and controlled experiments.

## Example rules

### CPU saturation

High CPU alone is not enough.

A stronger case is:

- CPU above its declared threshold for a material fraction of test buckets;
- request latency increases in the same window;
- CPU and latency have strong positive temporal correlation;
- traces do not show a separate downstream bottleneck.

The engine reports this as `CPU saturation is a plausible contributor`, not `CPU is the root cause`.

### Database pool pressure

Useful evidence includes:

- pool utilization at/near limit;
- pending requests / wait time increasing;
- latency correlation;
- DB operation duration and connection timeouts.

### Memory growth / endurance

A short load test cannot prove a leak. The engine only raises a retention/leak candidate when memory grows through the test and remains materially above the pre-test mean after load. Confirm with a soak test, GC/runtime metrics and heap/profiling evidence.

### Dependency bottleneck

Dependency latency that tracks application latency can be a plausible downstream contributor. Confirm with distributed traces and dependency-side saturation/error metrics.

### Cache degradation

A falling cache-hit ratio plus rising latency is useful evidence. Confirm that request mix/key cardinality did not change before blaming cache configuration.

### Autoscaling lag

Replica increase during a test proves a scaling reaction, not that autoscaling was too slow. Compare the scale-out timestamp with the latency/error peak and recovery window.

## Correlation strength

The project default for `strongCorrelation` is 0.65, but it is a diagnostic policy, not a statistical law. The number of matched buckets, workload shape, sampling resolution and autocorrelation all affect interpretation.

For repeated engineering decisions, prefer multiple test repetitions and consistent evidence over one high correlation coefficient.

## Recommended validation sequence

```text
hypothesis
   |
   +--> inspect traces/logs
   |
   +--> identify a controllable variable
   |
   +--> repeat the same workload
   |
   +--> change one thing
   |
   +--> compare the same telemetry + k6 metrics
```

That converts correlation into an experiment rather than an assertion.
