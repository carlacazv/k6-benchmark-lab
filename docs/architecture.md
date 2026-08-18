# Architecture decision

## Why not Saga
Saga coordinates multi-step distributed transactions and compensating actions. This project is a test harness/orchestrator, not a distributed transactional domain, so Saga would add state and failure modes without solving the problem.

## Chosen design
Use **Ports & Adapters + Strategy**:
- protocol adapters: REST, GraphQL, browser;
- workload strategies: smoke, baseline, load, stress, spike, soak, breakpoint;
- environment/config port: orthogonal env vars;
- evidence port: k6 summary JSON;
- diagnosis adapter: Node analyzer that turns evidence into Markdown + JSON;
- orchestration adapter: mise locally and GitHub Actions in CI.

This keeps protocol code small and makes scenario/NFR behavior reusable. The workflow is intentionally linear: discover NFRs -> model load -> verify observability/parity -> select scenario -> execute -> correlate -> diagnose -> recommend.
