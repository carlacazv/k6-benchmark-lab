# Controlled Experiments and RCA Validation

Phase 4 stops at an evidence-backed hypothesis. Phase 5 adds a controlled intervention so a QA can ask a stronger question: **when one suspected variable changes and the workload stays the same, does the expected performance effect appear repeatedly?**

## Evidence ladder

```text
observation -> correlation -> hypothesis -> controlled intervention -> supported / contradicted / inconclusive
```

`SUPPORTED` is deliberately not named `PROVEN`. A controlled lab experiment increases causal evidence, but it does not prove that the same variable is the production root cause or that the effect generalizes to a different architecture/environment.

## Experimental design

Each experiment declares:

- one hypothesis;
- exactly one intervention variable;
- a control value and a treatment value;
- the same VU/iteration workload for both conditions;
- at least three paired trials;
- an expected metric direction and materiality floor;
- a consistency requirement;
- explicit local-target safety ceilings.

The runner alternates order across trials (`control -> treatment`, `treatment -> control`, `control -> treatment`) to reduce simple monotonic time-order bias. It then evaluates every pair and the median control/treatment result.

## Classification

A trial is `SUPPORTED` only when both the configured relative and absolute effect floors are met in the expected direction. The inverse material effect is `CONTRADICTED`; smaller or noisy effects are `INCONCLUSIVE`.

The experiment result is `SUPPORTED` or `CONTRADICTED` only when the configured fraction of repeated trials agrees and the median pair agrees. Otherwise it remains `INCONCLUSIVE`.

This protects the model from treating one lucky run as causal evidence.

## Safe target policy

Phase 5 can only launch the repository-owned local Node lab. Remote targets are rejected by plan validation. The runner also restricts the knobs that may be changed and caps VUs, iterations, treatment intensity and duration.

Allowed controlled variables are:

- `LAB_BASE_LATENCY_MS`
- `LAB_DEPENDENCY_LATENCY_MS`
- `LAB_DB_WAIT_MS`
- `LAB_CPU_BURN_MS`
- `LAB_ERROR_RATE`

These are teaching/fault-injection controls, not production configuration guidance.

## Measurement workload

`tests/experiment/rest.js` is measurement-only. It intentionally has no performance NFR thresholds because the treatment is expected to make the service worse. A deliberately degraded treatment should not be confused with a failed test harness.

The CI gate instead checks that the known local experiment executes successfully and produces the expected `SUPPORTED` classification.

## Run an experiment

```bash
EXPERIMENT_CONFIG=experiments/dependency-latency.yaml mise run experiment
```

Or directly:

```bash
node scripts/experiment.mjs experiments/dependency-latency.yaml \
  --out-dir artifacts/experiments/dependency-latency
```

Use `--require-supported` only when `SUPPORTED` is itself an expected framework/fixture assertion, such as CI. In investigation work, `CONTRADICTED` and `INCONCLUSIVE` are legitimate scientific outcomes and should still produce reports.

## Included experiments

- `dependency-latency.yaml`: downstream wait -> REST p95;
- `cpu-pressure.yaml`: CPU work/request -> REST p95;
- `db-wait.yaml`: simulated DB wait -> REST p95;
- `error-rate.yaml`: injected failures -> HTTP failure rate.

## Artifacts

Each experiment preserves:

- the exact experiment plan;
- control/treatment k6 summaries for every trial;
- per-run lab configuration and logs;
- trial order;
- paired metric deltas;
- consistency;
- median control/treatment evidence;
- `experiment-report.json`;
- `experiment-report.md`.

## What this does not prove

Even a strongly supported controlled experiment does not establish that production degradation was caused by the same factor. Production RCA still needs the Phase 4 time-aligned telemetry evidence plus system-specific traces/logs and, when safe, a representative validation experiment.

Phase 6 will connect this experiment model to real observability signals from the instrumented lab rather than relying only on controlled knobs and k6 outcomes.
