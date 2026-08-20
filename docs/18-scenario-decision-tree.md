# Performance Scenario Decision Tree

Choose the scenario from the **question you need to answer**, not from the amount of load you want to generate.

```text
Is this the first execution of the script/system?
  |
  +-- yes --> SMOKE
  |
  +-- no --> Do you need normal busy-state behavior?
              |
              +-- yes --> BASELINE
              |
              +-- no --> Do you need to validate expected design demand / NFR?
                          |
                          +-- yes --> LOAD
                          |
                          +-- no --> Is the risk a sudden burst?
                                      |
                                      +-- yes --> SPIKE
                                      |
                                      +-- no --> Is the risk sustained time / retention / degradation?
                                                  |
                                                  +-- yes --> SOAK
                                                  |
                                                  +-- no --> Do you need behavior above expected demand?
                                                              |
                                                              +-- yes --> STRESS
                                                              |
                                                              +-- no --> Do you need to discover the first controlled limit?
                                                                          |
                                                                          +-- yes --> BREAKPOINT
                                                                          +-- no --> Revisit the question/NFR
```

## Smoke

**Question:** Is the performance test executable and is the target basically healthy?

Use it for:

- PR/push CI;
- script validation;
- environment connectivity;
- threshold/config sanity.

Do not use it to infer capacity or long-term performance.

## Baseline

**Question:** How does the system behave under representative normal busy demand?

Use it to establish:

- stable latency/error/throughput reference;
- normal telemetry ranges;
- a comparison point for future regressions.

Baseline is not necessarily average traffic. It should represent a meaningful normal operating point.

## Load

**Question:** Can the system meet the NFR at expected design demand?

Typical model:

```text
observed peak + approved headroom = design peak
```

A successful load test supports a scoped capacity statement only for the tested environment and demand model.

## Stress

**Question:** What happens when demand exceeds the expected design point?

Look for:

- latency growth shape;
- errors/timeouts;
- queueing/backpressure;
- dropped iterations;
- resource saturation;
- recovery after the overload.

Stress is not the same as breakpoint. You can stress a system without trying to find its exact first limit.

## Spike

**Question:** How does the system react when demand changes very quickly?

Look for:

- autoscaling delay;
- connection-pool behavior;
- cache warmup;
- queues/backlogs;
- error bursts;
- recovery time.

A spike scenario is about the **rate of change**, not just a high final rate.

## Soak

**Question:** Does the system remain healthy under sustained demand over time?

Look for:

- memory retention/leaks;
- connection/resource leakage;
- queue growth;
- periodic jobs;
- GC behavior;
- slow degradation;
- dependency quota exhaustion.

A 30-second test cannot validate a memory-retention hypothesis just because memory rose.

## Breakpoint

**Question:** Where is the first controlled point at which an agreed safety/NFR/resource condition is violated?

Breakpoint should be discovered through controlled exploration. A configured maximum rate is only an **exploration ceiling**.

Stop when an approved condition is reached, for example:

- p95/p99 guardrail violation;
- error-rate safety threshold;
- dropped-iteration/backlog condition;
- CPU/DB pool/resource safety ceiling;
- explicit infrastructure protection limit.

Never treat "the highest rate we configured" as proven capacity.

## Common mistakes

### "We have 10,000 users, so run 10,000 VUs"

Users are not automatically concurrent operations. Model arrival/operation rate and user behavior first.

### "Load test failed, so run stress"

A failed load test already answered an important question. Diagnose it before increasing pressure.

### "Smoke passed, therefore the build has no performance regression"

Smoke has intentionally weak statistical power and low traffic. It is primarily a safety/integration gate.

### "Stress found 1,000 RPS, so capacity is 1,000 RPS"

Only if 1,000 RPS corresponds to a clearly defined first violation and the environment/model are representative. Otherwise it is simply an observed test point.

## Recommended sequence for a new system

```text
smoke
  -> baseline
  -> load at design demand
  -> scenario-specific risk (spike / stress / soak)
  -> breakpoint only when the capacity question justifies it
```

Do not automatically execute every scenario. Each run should answer a decision-relevant question.
