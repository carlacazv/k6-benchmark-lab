# QA Performance Engineering Playbook

Use this playbook before writing or running a performance test.

## Step 1 — Define the risk, not the tool

Write one sentence:

> We need evidence that **[system/user flow]** can handle **[business demand or event]** while meeting **[NFR]** under **[environment assumptions]**.

Bad starting point: "run 500 VUs".

Good starting point: "validate checkout at the observed production peak plus approved headroom while p95 stays under 500 ms and errors under 1%."

## Step 2 — Define NFRs

At minimum, decide:

- latency: p95 and p99;
- error-rate guardrail;
- check/success rate;
- throughput or arrival rate expectation;
- business-critical browser Web Vitals when applicable;
- recovery expectation for spike/stress scenarios;
- safety ceilings for destructive exploration.

If there is no approved NFR, record that as a readiness gap instead of inventing one silently.

## Step 3 — Discover production demand

Prefer production telemetry over guessed concurrency.

Look for:

- operation/arrival rate over a representative window;
- p50/p75/p95/p99 demand;
- busiest UTC hours;
- observed peaks;
- exceptional campaigns/incidents/events;
- weekly/daily seasonality;
- data gaps and coverage.

Use the repository discovery engine to turn this into a workload profile.

## Step 4 — Build the workload model

The default model separates:

- **baseline** — normal busy demand;
- **observed peak** — real high demand;
- **design peak** — observed peak plus approved headroom;
- **exploration ceiling** — a safety bound for controlled exploration, not proven capacity.

One iteration should represent one meaningful operation unless the scenario explicitly models a multi-step user journey.

## Step 5 — Check environment readiness

Before increasing load, compare TEST and PRD assumptions:

- compute size/replica limits;
- database topology/pool limits;
- cache configuration;
- external dependencies/mocks;
- autoscaling behavior;
- observability availability;
- representative data volume;
- rate limits and quotas.

A test can be technically correct and still answer the wrong question if the environment is not representative.

## Step 6 — Select the scenario by question

Do not pick a scenario by habit.

| Question | Scenario |
|---|---|
| Does the script/system basically work? | smoke |
| What does normal busy traffic look like? | baseline |
| Can it handle expected design demand? | load |
| What happens above expected demand? | stress |
| How does it react to a sudden burst? | spike |
| Does behavior degrade over time? | soak |
| Where is the first controlled limit? | breakpoint |

See [Scenario Decision Tree](18-scenario-decision-tree.md).

## Step 7 — Execute with evidence capture

A useful performance run should preserve:

- exact UTC start/end;
- k6 summary;
- granular k6 time series;
- scenario and target metadata;
- environment/runtime evidence;
- telemetry for the same time window;
- CI outcome and thresholds.

A screenshot of the k6 console is not enough evidence for diagnosis.

## Step 8 — Analyze symptoms before causes

Start with observations:

- p95/p99;
- error rate;
- throughput/iteration rate;
- dropped iterations;
- Apdex with sample sufficiency;
- browser Web Vitals;
- recovery behavior.

Then inspect telemetry:

- CPU/event loop;
- memory/GC;
- DB pool/wait;
- dependency latency/errors;
- cache behavior;
- replicas/autoscaling;
- queue/backlog signals when present.

## Step 9 — Create hypotheses, not verdicts

A strong temporal correlation may support a hypothesis, but it is not causal proof.

Example:

```text
Observation: request latency rises during the middle of the run
Telemetry: dependency latency rises in the same interval
Correlation: strong positive relationship with plausible lag
Hypothesis: downstream dependency latency is a plausible contributor
```

The framework intentionally rejects wrong-direction evidence. A large absolute `r` with the wrong sign is not support for the hypothesis.

## Step 10 — Validate important hypotheses

For hypotheses that matter to a decision:

1. keep workload constant;
2. change one controlled variable;
3. repeat control/treatment pairs;
4. alternate order when possible;
5. require material effect size, not just direction;
6. classify the outcome as `SUPPORTED`, `CONTRADICTED`, or `INCONCLUSIVE`.

Do not rewrite the hypothesis after seeing the result without recording that it changed.

## Step 11 — Make the decision explicit

Every performance investigation should end with one of these:

- **PASS** — evidence supports the NFR for the tested scope;
- **FAIL** — a defined NFR/quality gate failed;
- **BLOCKED** — readiness/evidence is insufficient;
- **INVESTIGATE** — symptom is real but causality/capacity remains unresolved.

Include scope and limitations. "Passed performance" is not meaningful without saying what demand, environment, scenario and NFR were tested.

## Review checklist

Before sharing a result, ask:

- Was the load derived from evidence?
- Was the test environment assumption documented?
- Was the correct scenario selected for the risk?
- Are p95 and p99 shown with errors/throughput?
- Are dropped iterations checked?
- Is sample sufficiency considered?
- Is telemetry aligned to the exact test window?
- Are correlation and causality clearly separated?
- Was a critical hypothesis validated independently?
- Can another QA reproduce the decision from the saved artifacts?
