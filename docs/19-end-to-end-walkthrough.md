# End-to-End Walkthrough

This walkthrough shows how a QA can move from an undefined performance question to an evidence-backed result using the model.

## Scenario

Assume a product API has no trusted performance test yet. Production telemetry suggests a normal busy period around 55 operations/second and an observed peak around 78 operations/second. The team wants to know whether the service can support the observed peak plus 25% headroom while keeping p95 below 500 ms and errors below 1%.

The values below are illustrative. In a real project, use your telemetry and approved NFRs.

## 1. Copy the templates

```bash
cp templates/performance-test-plan.yaml performance-test-plan.yaml
cp templates/telemetry-discovery.yaml telemetry-discovery.yaml
cp templates/telemetry-correlation.yaml telemetry-correlation.yaml
```

Edit the provider/source details instead of changing the engine.

## 2. Discover the workload

```bash
mise run discover
```

Review:

```text
artifacts/discovery/workload-profile.md
artifacts/discovery/workload-profile.json
artifacts/discovery/plan-volume-suggestion.yaml
```

Questions to answer:

- Is coverage high enough?
- Is the time range representative?
- Are p75/p95/p99 plausible?
- Are exceptional intervals normal business demand or special events?
- Should they influence capacity planning?

Do not blindly promote the maximum observed event to normal capacity demand.

## 3. Define NFR and environment assumptions

Update the performance plan with:

- p95/p99;
- error/check rate;
- expected demand/headroom;
- PRD and TEST capacity assumptions;
- discovery confidence requirement;
- observability requirements.

Then run:

```bash
mise run readiness
```

Review:

```text
artifacts/readiness/readiness-report.md
```

Possible outcomes:

- `READY`
- `READY_WITH_WARNINGS`
- `BLOCKED`

If blocked, fix the information/environment gap. Do not bypass readiness by manually raising VUs.

## 4. Select the scenario

For the stated question — "can the system handle expected design demand?" — the correct scenario is **load**.

The safe CI default remains smoke. Higher load should be explicit and authorized.

Use the [scenario decision tree](18-scenario-decision-tree.md) if the business question changes.

## 5. Run the test

For the local study target:

```bash
mise run lab
```

In another terminal, use the safe path first:

```bash
mise run ci-smoke
```

Once the plan/readiness and target are appropriate, run the selected scenario explicitly rather than silently changing PR CI.

Each protocol run preserves:

```text
summary.json
timeseries.json
test-window.json
```

The exact window matters because infrastructure metrics outside that window should not be mixed into the same causal story.

## 6. Read the result as observations

Start with the client-side facts:

- p95/p99;
- errors;
- throughput/iteration rate;
- dropped iterations;
- checks;
- Apdex and its sample eligibility;
- Web Vitals for browser flows.

Example statement:

> At the tested design demand, p95 remained below 500 ms, p99 remained below 1,000 ms, error rate stayed below 1%, and no dropped iterations were observed.

This is stronger than "performance passed" because it states what was actually measured.

## 7. Align telemetry to the run

```bash
mise run correlate
```

The correlation engine compares the exact k6 time window with telemetry and can evaluate roles such as:

- CPU/event loop;
- memory;
- DB pool/wait;
- dependency latency;
- cache hit ratio;
- replicas/autoscaling.

Treat the report as hypothesis generation, not root-cause proof.

## 8. Check direction and context

Suppose request latency and CPU have `r=-0.82` while dependency latency has `r=0.97`.

A naive "largest absolute correlation wins" rule could blame CPU. This model does not.

Expected direction, threshold overlap, lag, data sufficiency and system meaning all matter.

A valid hypothesis might be:

> Downstream dependency latency tracks request latency and is a plausible contributor.

## 9. Validate a decision-relevant hypothesis

Copy and adapt:

```bash
cp templates/experiment.yaml experiments/my-hypothesis.yaml
```

Then run the experiment only against an owned/authorized target. In this repository, fault injection is restricted to the local lab.

The experiment compares the same workload across repeated control/treatment pairs and reports:

- `SUPPORTED`
- `CONTRADICTED`
- `INCONCLUSIVE`

Do not change several variables together and call the result causal validation.

## 10. Validate the full owned-lab evidence chain

For the repository lab:

```bash
mise run full-validation
```

This adds real Prometheus telemetry and compares its independently generated hypothesis with the separate controlled experiment.

Final evidence-chain statuses:

- `ALIGNED`
- `PARTIAL`
- `MISMATCH`

`ALIGNED` strengthens the explanation inside the controlled lab. It does not prove the same cause in production.

## 11. Write the conclusion

A useful conclusion contains five pieces:

```text
Decision
Demand/scenario tested
NFR outcome
Evidence-backed hypothesis (if relevant)
Limitations / next action
```

Example:

> PASS for the tested load case: the service met the approved latency/error NFR at the modeled design peak in the stated TEST environment. A real-telemetry correlation identified downstream dependency latency as a plausible contributor to the observed mid-run latency increase, and a separate one-variable experiment independently supported that mechanism in the owned lab. Production causality is not claimed; traces and dependency telemetry should be checked if the same symptom occurs in production.

That is the level of reasoning this repository is designed to teach and automate.
