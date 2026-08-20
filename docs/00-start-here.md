# Start Here: Performance Engineering for QAs

This repository is not a collection of k6 scripts. It is a reusable decision model for QAs and SDETs who need to answer four questions with evidence:

1. **How much load should we generate?**
2. **Which performance scenario answers the current risk?**
3. **What changed in the system while the test ran?**
4. **How strong is the evidence behind a bottleneck hypothesis?**

The model is intentionally ordered:

```text
business demand
  -> production telemetry
  -> workload model
  -> environment/readiness
  -> scenario selection
  -> k6 execution
  -> exact test window
  -> telemetry correlation
  -> bottleneck hypothesis
  -> controlled experiment
  -> evidence alignment
```

Do not skip directly from a k6 result to a root-cause claim.

## 1. Choose your starting point

### I only want to learn the model

Read these first:

1. [NFR discovery](01-nfr-discovery.md)
2. [Workload modeling](02-workload-modeling.md)
3. [Scenario selection](03-scenario-selection.md)
4. [QA Performance Engineering Playbook](17-qa-performance-playbook.md)
5. [Scenario Decision Tree](18-scenario-decision-tree.md)

### I want to run the lab locally

Prerequisites:

- `mise`
- Node.js and k6 are installed through `mise`
- Docker only for the real-Prometheus validation path

```bash
mise install
mise run test
mise run discover
mise run readiness
mise run lab
```

In another terminal:

```bash
mise run ci-smoke
```

`ci-smoke` is the safe default. It does not automatically escalate to load/stress/breakpoint.

### I want to adapt the model to my project

Start by copying the files in [`templates/`](../templates/):

- `performance-test-plan.yaml`
- `telemetry-discovery.yaml`
- `telemetry-correlation.yaml`
- `experiment.yaml`

Then follow the [end-to-end walkthrough](19-end-to-end-walkthrough.md).

## 2. Understand the evidence levels

The repository deliberately separates evidence strength:

| Level | Meaning | What you may claim |
|---|---|---|
| Observation | k6 or telemetry showed a symptom | "Latency increased" |
| Correlation | two signals moved together in time | "Dependency latency is associated with request latency" |
| Hypothesis | correlation + thresholds + system context support an explanation | "Dependency latency is a plausible contributor" |
| Controlled experiment | one variable changed while workload stayed constant | `SUPPORTED`, `CONTRADICTED`, or `INCONCLUSIVE` |
| Evidence alignment | independent telemetry and experiment paths agree | `ALIGNED`, `PARTIAL`, or `MISMATCH` |

Even `ALIGNED` is not production causal proof. External validity still matters.

## 3. Safe execution policy

- PR/push CI always uses `smoke` for the ordinary performance path.
- Higher load must be explicit.
- Breakpoint is discovered by a controlled safety/NFR/resource violation; a configured exploration ceiling is not proven capacity.
- Fault injection is restricted to the repository-owned local lab.
- Synthetic telemetry validates plumbing only and cannot produce operational RCA conclusions.

## 4. What to read next

If your question is **"which test should I run?"**, go to the [scenario decision tree](18-scenario-decision-tree.md).

If your question is **"how do I use this as a QA process?"**, go to the [QA Performance Engineering Playbook](17-qa-performance-playbook.md).

If your question is **"how does the complete chain work?"**, go to the [end-to-end walkthrough](19-end-to-end-walkthrough.md).

If something fails locally, use [troubleshooting](20-troubleshooting.md).
