# 8. Performance readiness engine

The readiness engine exists to prevent a common failure mode: a technically valid k6 script producing a professionally invalid performance conclusion.

Run:

```bash
mise run readiness
```

It reads `performance-test-plan.yaml` and emits a Markdown report, JSON decision record and `runtime.env`.

## Decision order

1. **Authorization** — is this target explicitly authorized for load?
2. **NFRs** — are p95, p99, error budget and Apdex criteria declared and internally valid?
3. **Workload mapping** — is the volume unit `iterations_per_second`, and does one iteration model one measured business operation?
4. **Traffic model** — can baseline, observed/derived peak, headroom and exploration ceiling be calculated?
5. **Environment** — are PRD/TEST replicas, CPU and memory known? Is the comparison intentionally `equivalent` or `scaled`?
6. **Configuration parity** — DB/cache/network/autoscaling differences become explicit warnings.
7. **Observability** — non-smoke tests require application metrics, infrastructure metrics and logs; traces/dependency metrics improve diagnosis and are surfaced as warnings when absent.
8. **Scenario** — the business objective maps to a test strategy.
9. **Generator starting point** — the engine estimates initial arrival-rate VUs from maximum planned arrival rate, p99 NFR and a safety factor. This is calibration input, not a final capacity setting.

## Objective to scenario

| objective.type | recommended scenario | question |
|---|---|---|
| `sanity` | smoke | Is the script/environment executable? |
| `establish_baseline` | baseline | What does healthy steady state look like? |
| `validate_expected_peak` | load | Can the system meet NFRs at design peak? |
| `validate_sudden_peak` | spike | Can it absorb and recover from a sudden burst? |
| `find_degradation_point` | stress | How does behavior degrade above requirement? |
| `validate_stability` | soak | Does performance drift over time? |
| `find_breakpoint` | breakpoint | Where is the controlled capacity boundary? |

A CLI/pipeline scenario override is allowed, but the report records when it differs from the recommendation.

## Statuses

- `READY`: declared prerequisites are complete and no uncertainty rule fired.
- `READY_WITH_WARNINGS`: execution is allowed, but the report contains interpretation risks.
- `BLOCKED`: execution above smoke must not proceed until blockers are fixed.

Readiness is not a certification. It proves only that the declared plan is internally consistent enough to run the intended experiment.
