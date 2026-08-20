# Changelog

All notable project milestones are documented here.

## [1.0.0] — 2026-08-20

### Added — Performance execution foundation

- pinned Node.js and k6 toolchain through `mise`;
- controlled local Node study target;
- REST, GraphQL and browser k6 adapters;
- smoke, baseline, load, stress, spike, soak and breakpoint workload strategies;
- p95/p99/error/check thresholds, Apdex and browser Web Vitals;
- CI-safe smoke default and evidence artifacts.

### Added — Readiness and workload modeling

- declarative `performance-test-plan.yaml`;
- business-volume and arrival-rate modeling;
- observed peak + headroom design model;
- exploration ceiling separated from proven breakpoint/capacity;
- TEST vs PRD capacity/parity checks;
- readiness states `READY`, `READY_WITH_WARNINGS`, `BLOCKED`;
- scenario recommendation by objective.

### Added — Telemetry and capacity intelligence

- workload discovery from synthetic, normalized file, access log, Prometheus-compatible and Datadog sources;
- coverage/confidence checks;
- busy-period and exceptional-event detection;
- discovery-to-readiness workload-profile integration;
- idle-bucket handling for access-log distributions.

### Added — Post-test correlation

- exact UTC k6 start/end windows;
- granular k6 JSON time series;
- pre/during/post telemetry alignment;
- lag-aware Pearson correlation;
- diagnostic roles for CPU/event loop, memory, DB pool/wait, dependency latency, cache hit and replicas;
- correlation-direction guardrails;
- minimum matched-bucket policy;
- synthetic-telemetry RCA suppression;
- Apdex minimum-sample gate.

### Added — Controlled experiments

- paired repeated control/treatment experiments;
- alternating AB/BA order;
- one-variable intervention policy;
- absolute + relative materiality checks;
- `SUPPORTED`, `CONTRADICTED`, `INCONCLUSIVE` classification;
- local-only fault injection for dependency latency, DB wait, CPU pressure and error probability.

### Added — Real observability evidence chain

- real Prometheus process in the owned lab validation path;
- Prometheus metrics for dependency latency, DB wait, event loop, process CPU/memory and request activity;
- temporal baseline/treatment/recovery observability workload;
- real `query_range` correlation validation;
- independent telemetry-vs-experiment alignment;
- `ALIGNED`, `PARTIAL`, `MISMATCH` evidence-chain classification;
- explicit non-causal interpretation even when evidence is aligned.

### Added — v1 QA productization

- Start Here onboarding;
- QA Performance Engineering Playbook;
- scenario decision tree;
- end-to-end walkthrough;
- troubleshooting guide;
- reusable performance-plan, telemetry and experiment templates;
- contribution guide;
- roadmap;
- release/docs QC.

### Added — Licensing

- Apache License, Version 2.0 (`Apache-2.0`);
- repository-level `LICENSE` and `NOTICE`;
- explicit project attribution to Carla Cury Azevedo;
- automated release-QC validation for license metadata and files.

### Safety and interpretation

- PR/push ordinary performance execution remains smoke-only;
- aggressive scenarios are explicit;
- built-in fault injection remains restricted to the owned local lab;
- synthetic telemetry cannot produce operational RCA conclusions;
- correlation is never labelled causal proof;
- evidence remains available in artifacts even when the final quality gate fails.
