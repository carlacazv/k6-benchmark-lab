# k6 Benchmark Lab

**A Performance Engineering decision model for QAs and SDETs — from production demand to evidence-backed bottleneck validation.**

Most performance-testing examples start with a number of virtual users. This project starts earlier:

> **How much load should we generate, which scenario answers the risk, and what evidence supports the conclusion?**

The model connects workload discovery, readiness, k6 execution, observability and controlled experimentation without treating correlation as root cause.

## Start here

New to the project? Read **[Start Here](docs/00-start-here.md)**.

Then use:

- **[QA Performance Engineering Playbook](docs/17-qa-performance-playbook.md)** — the end-to-end reasoning process;
- **[Scenario Decision Tree](docs/18-scenario-decision-tree.md)** — smoke vs baseline vs load vs stress vs spike vs soak vs breakpoint;
- **[End-to-End Walkthrough](docs/19-end-to-end-walkthrough.md)** — one complete worked workflow;
- **[Planning Poker real-target case](use-cases/planning-poker/README.md)** — apply the model to a Fastify + Socket.IO + SQLite application;
- **[Troubleshooting](docs/20-troubleshooting.md)** — diagnose the framework without weakening evidence gates;
- **[`templates/`](templates/)** — copy-ready performance plan, telemetry and experiment configuration.

## The model

```text
business demand
      |
      v
production telemetry ----> workload profile
                              |
                              v
performance plan -------> readiness gate
                              |
                              v
                        scenario selection
                              |
                              v
                             k6
                              |
                +-------------+-------------+
                |                           |
                v                           v
        exact test window             client symptoms
                |                 p95/p99/errors/load
                v                           |
       aligned system telemetry <-----------+
                |
                v
        correlation + lag
                |
                v
        bottleneck hypothesis
                |
                v
      controlled experiment
       control / treatment
                |
                v
SUPPORTED / CONTRADICTED / INCONCLUSIVE
                |
                v
real telemetry + experiment alignment
                |
                v
      ALIGNED / PARTIAL / MISMATCH
```

**Correlation is not causation.** The framework deliberately preserves that boundary at every stage.

## What the project helps a QA answer

### How much load should I generate?

Use production telemetry or explicit business math to derive:

- baseline demand;
- observed peak;
- design peak with approved headroom;
- an exploration ceiling for controlled investigation.

The exploration ceiling is **not** automatically system capacity. Breakpoint must be discovered through an agreed NFR/safety/resource violation.

### Which test should I run?

| Question | Scenario |
|---|---|
| Does the script/target basically work? | `smoke` |
| What does representative normal busy traffic look like? | `baseline` |
| Can the system meet NFR at expected design demand? | `load` |
| What happens above expected demand? | `stress` |
| What happens when demand jumps suddenly? | `spike` |
| Does behavior degrade over time? | `soak` |
| Where is the first controlled limit? | `breakpoint` |

See the [Scenario Decision Tree](docs/18-scenario-decision-tree.md) before choosing by habit.

### Is the environment ready?

The readiness engine evaluates:

- performance-plan completeness;
- production workload discovery/confidence;
- PRD vs TEST capacity/parity;
- observability requirements;
- scenario/objective compatibility;
- initial VU estimates.

Results are:

- `READY`
- `READY_WITH_WARNINGS`
- `BLOCKED`

### What failed — and why might it have failed?

The analysis path separates:

```text
observation -> correlation -> hypothesis -> controlled validation
```

It uses evidence such as:

- p95/p99;
- error/check rate;
- throughput and dropped iterations;
- Apdex with sample sufficiency;
- browser Web Vitals;
- CPU/event loop;
- memory;
- DB pool/wait;
- dependency latency;
- cache behavior;
- replicas/autoscaling;
- temporal lag.

A large absolute correlation with the wrong direction does not support a hypothesis.

## Quick start

Prerequisite: [`mise`](https://mise.jdx.dev/).

```bash
mise install
mise run test
mise run release-qc
```

Discover and evaluate the default controlled lab plan:

```bash
mise run discover
mise run readiness
```

Start the owned lab:

```bash
mise run lab
```

In another terminal, run the safe path:

```bash
mise run ci-smoke
```

The ordinary PR/push path stays on **smoke**. It never silently escalates to load/stress/soak/breakpoint.

## Full real-observability validation

Docker is required only for the real-Prometheus evidence path:

```bash
mise run full-validation
```

That path validates:

```text
k6 observation
  -> real Prometheus telemetry
  -> time-aligned correlation
  -> dependency hypothesis
  -> separate paired experiment
  -> evidence-chain alignment
```

Synthetic telemetry cannot satisfy the operational RCA/evidence-chain gate.

## Controlled experiments

The built-in experiment runner is intentionally restricted to the repository-owned local lab.

It supports controlled examples for:

- dependency latency;
- DB wait;
- CPU pressure;
- error probability.

The same workload is executed across repeated control/treatment pairs with one changed variable. Results are classified as:

- `SUPPORTED`
- `CONTRADICTED`
- `INCONCLUSIVE`

`SUPPORTED` means the intervention produced the expected material effect under the tested lab conditions. It does not prove production causality.

## Evidence saved by CI

The GitHub Actions workflow preserves evidence even when the final gate fails, including:

- workload discovery profile;
- readiness Markdown/JSON/runtime env;
- REST/GraphQL/browser k6 summaries;
- granular k6 time series;
- exact test windows;
- synthetic plumbing correlation report;
- real Prometheus observability/correlation evidence;
- controlled experiment trials and configs;
- evidence-chain report;
- performance diagnosis;
- environment/runtime evidence.

This allows a failed run to be investigated instead of disappearing behind a red CI status.

## Configuration templates

Copy and adapt:

```text
templates/performance-test-plan.yaml
templates/telemetry-discovery.yaml
templates/telemetry-correlation.yaml
templates/experiment.yaml
```

Provider credentials stay in environment variables/secrets, never committed YAML.

Supported telemetry paths include:

- Prometheus-compatible backends;
- Datadog metrics;
- normalized exported files;
- access logs for workload discovery;
- synthetic fixtures for deterministic learning/CI plumbing only.

OpenTelemetry is treated as telemetry transport/instrumentation; historical analysis queries the backend where the telemetry is stored.

## Safety defaults

- PR/push ordinary performance execution = `smoke`.
- Higher load is explicit.
- Aggressive tests belong only on infrastructure you own or are explicitly authorized to test.
- Built-in fault injection cannot target arbitrary remote systems.
- Secrets stay out of repository configuration.
- Synthetic telemetry cannot produce operational RCA conclusions.
- Small smoke samples do not automatically become statistical release gates.
- Correlation, lag and resource overlap remain diagnostic evidence, not causal proof.

## Project architecture

The implementation follows **Ports & Adapters + Strategy**:

- workload/scenario strategies are independent from protocol adapters;
- telemetry providers normalize into common time-series evidence;
- readiness consumes declarative plans/profiles;
- correlation consumes exact-window k6 + telemetry data;
- experiment/evidence-chain layers remain separate from observation.

Saga is intentionally out of scope because this repository does not solve a distributed transaction/compensation problem.

## Documentation map

The original numbered technical guides remain useful for deeper study:

- [`docs/01-nfr-discovery.md`](docs/01-nfr-discovery.md)
- [`docs/02-workload-modeling.md`](docs/02-workload-modeling.md)
- [`docs/03-scenario-selection.md`](docs/03-scenario-selection.md)
- [`docs/04-observability-and-environment.md`](docs/04-observability-and-environment.md)
- [`docs/08-readiness-engine.md`](docs/08-readiness-engine.md)
- [`docs/09-performance-test-plan.md`](docs/09-performance-test-plan.md)
- [`docs/10-telemetry-discovery.md`](docs/10-telemetry-discovery.md)
- [`docs/13-post-test-correlation.md`](docs/13-post-test-correlation.md)
- [`docs/14-rca-hypotheses.md`](docs/14-rca-hypotheses.md)
- [`docs/15-controlled-experiments.md`](docs/15-controlled-experiments.md)
- [`docs/16-real-observability-validation.md`](docs/16-real-observability-validation.md)

For the v1 learning path, start with [Start Here](docs/00-start-here.md) instead of reading every file sequentially.

## Contributing and roadmap

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [ROADMAP.md](ROADMAP.md)
- [CHANGELOG.md](CHANGELOG.md)
- [v1 Release Guide](docs/21-v1-release-guide.md)

## License

Licensed under the **Apache License, Version 2.0** (`Apache-2.0`). See [LICENSE](LICENSE) for the full terms and [NOTICE](NOTICE) for project attribution.

Copyright 2026 Carla Cury Azevedo.
