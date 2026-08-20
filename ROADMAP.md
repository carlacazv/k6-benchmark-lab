# Roadmap

This roadmap separates the **v1 decision model** from optional future engineering. The project should not keep expanding just because more performance tooling exists.

## v1.0 — Performance Engineering Model for QAs

Status: **release candidate**

The v1 scope is complete when the productization PR is merged and the release checklist is satisfied.

Included:

- k6 REST, GraphQL and browser execution;
- smoke, baseline, load, stress, spike, soak and breakpoint strategies;
- production-demand discovery from telemetry;
- workload-profile generation;
- performance readiness engine;
- PRD vs TEST capacity/parity checks;
- NFR thresholds and Apdex sample-sufficiency guardrail;
- exact k6 test windows and granular time series;
- Prometheus, Datadog, file/export and synthetic telemetry correlation adapters;
- threshold + direction + lag-aware bottleneck hypotheses;
- explicit correlation-vs-causation guardrails;
- controlled paired experiments with `SUPPORTED / CONTRADICTED / INCONCLUSIVE`;
- real Prometheus validation in the owned lab;
- independent evidence-chain classification as `ALIGNED / PARTIAL / MISMATCH`;
- CI evidence artifacts;
- QA playbook, scenario decision tree, templates, walkthrough and troubleshooting.

## v1.x — Maintenance only

Appropriate v1.x work:

- documentation fixes;
- bug fixes;
- compatibility updates;
- clearer examples;
- additional safe provider examples using existing adapter contracts;
- stronger tests/guardrails that do not change the conceptual model.

Avoid turning v1.x into a hidden v2.

## Possible v2 themes

These are intentionally **not required** for v1.

### Distributed tracing evidence

- trace/span correlation for selected slow requests;
- service-map/dependency attribution;
- linking time-series hypotheses to exemplar traces.

### Regression intelligence

- compare release/build performance distributions;
- baseline history;
- regression confidence and effect-size policies;
- trend artifacts across CI runs.

### More observability backends

- CloudWatch metric/log adapter examples;
- OpenTelemetry-backed stores;
- additional APM providers where a stable query contract exists.

### Richer capacity modeling

- multi-operation workload mixes;
- queueing/backpressure models;
- autoscaling response models;
- cost/performance tradeoff analysis.

### AI-assisted investigation

Potential future AI assistance should summarize evidence and propose experiments, not silently replace measurement or promote correlation to causality.

A safe AI layer would need to preserve:

```text
source evidence
assumptions
confidence/data quality
alternative hypotheses
recommended validation experiment
```

## Explicit non-goals

- turning k6 into a production traffic generator by default;
- automatic destructive testing of arbitrary targets;
- declaring root cause from correlation alone;
- universal performance thresholds that ignore business/system context;
- running every performance scenario on every pull request;
- adding Saga/distributed-transaction architecture where no transaction-compensation problem exists.
