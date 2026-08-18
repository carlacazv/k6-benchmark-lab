# k6 Benchmark Lab

A performance-engineering learning lab for QAs who need to design, execute and diagnose k6 tests with safety, confidence and technical discipline.

## The workflow
1. Write a versioned `performance-test-plan.yaml`.
2. Discover non-functional acceptance criteria.
3. Derive baseline, observed peak, design peak with headroom and a controlled breakpoint exploration ceiling from production telemetry/business volume.
4. Verify that one k6 iteration represents the business operation used in the volume calculation.
5. Verify application instrumentation and production-vs-test capacity/configuration.
6. Let the readiness engine recommend the scenario: smoke, baseline, load, stress, spike, soak/endurance or breakpoint.
7. Execute REST, GraphQL or browser performance adapters against an authorized target.
8. Analyze p95/p99, errors, throughput, dropped iterations, Web Vitals and Apdex.
9. Correlate with application/infrastructure telemetry.
10. Produce readiness evidence, bottleneck hypotheses and recommendations in the CI artifact.

Read the guides in `docs/` in numeric order before running anything above smoke.

## Phase 2: performance readiness engine

Performance execution is now preceded by a machine-enforced preflight:

```text
performance-test-plan.yaml
        |
        v
NFR + authorization validation
        |
        v
traffic model + headroom
        |
        v
PRD vs TEST capacity/parity
        |
        v
observability readiness
        |
        v
scenario recommendation + VU starting point
        |
        v
artifacts/readiness/runtime.env
        |
        v
k6 adapters
```

The engine writes:
- `artifacts/readiness/readiness-report.md` for humans;
- `artifacts/readiness/readiness.json` for automation;
- `artifacts/readiness/runtime.env` for k6 runtime configuration.

A non-smoke test is blocked when authorization, required NFRs, volume mapping, environment capacity, application metrics, infrastructure metrics or logs are missing. Warnings remain visible for uncertainties such as estimated traffic, missing traces or topology differences.

## Quick start

```bash
mise install
mise run readiness      # inspect the plan before generating load
mise run lab            # terminal 1
mise run ci-smoke       # safe pipeline-equivalent smoke
mise run suite          # uses the scenario recommended by the plan
```

You can still run an adapter directly when experimenting locally:

```bash
SCENARIO=smoke K6_REPORT_DIR=artifacts/rest mise run rest
SCENARIO=smoke K6_REPORT_DIR=artifacts/graphql mise run graphql
SCENARIO=smoke K6_REPORT_DIR=artifacts/browser mise run frontend
mise run analyze
```

## Volume terminology

The readiness engine models **iterations per second**, not an ambiguous raw user count. One k6 iteration must map to the business operation used in the volume calculation. Existing `BASELINE_RPS`, `PEAK_RPS` and `LIMIT_RPS` variables remain supported for compatibility, while generated plans prefer `BASELINE_RATE`, `PEAK_RATE` and `LIMIT_RATE`.

`explorationCeiling` is intentionally not called “the system limit”: the true breakpoint only exists after a controlled test shows where an NFR, safety guardrail or resource boundary is consistently crossed.

## Dynamic environment

The same scripts run in local/test/CI environments. The performance plan is source-controlled and contains non-secret test design facts. Runtime values are exported as env vars; credentials and tokens still belong in environment variables/secrets, never in the plan.

## Safe default

PRs and pushes run only `smoke`. Higher-load scenarios are explicit `workflow_dispatch` choices or `mise run suite` locally after readiness passes. Public demo systems are for small-scale learning; aggressive load belongs on infrastructure you own or are explicitly authorized to test.

## Architecture

This project uses Ports & Adapters + Strategy plus a preflight policy layer. Saga remains intentionally rejected because there is no distributed transaction/compensation problem to solve. See `docs/architecture.md` and `docs/08-readiness-engine.md`.

## CI evidence

GitHub Actions uploads:
- readiness Markdown/JSON/runtime env;
- raw k6 `summary.json` for REST, GraphQL and browser;
- `performance-diagnosis.md` and `performance-diagnosis.json`;
- runner CPU/memory, selected plan, local target configuration/metrics/logs.

Readiness and k6 threshold failures still upload evidence before the final quality gate fails the workflow.
