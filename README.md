# k6 Benchmark Lab

A performance-engineering learning lab for QAs who need to design, execute and diagnose k6 tests with safety, confidence and technical discipline.

## The workflow
1. Discover non-functional acceptance criteria.
2. Derive baseline, expected peak, headroom and controlled limit from production telemetry/business volume.
3. Verify application instrumentation and production-vs-test capacity/configuration.
4. Select the scenario that answers the question: smoke, baseline, load, stress, spike, soak/endurance or breakpoint.
5. Execute REST, GraphQL or browser performance adapters against an authorized target.
6. Analyze p95/p99, errors, throughput, dropped iterations and Apdex.
7. Correlate with application/infrastructure telemetry.
8. Produce evidence, bottleneck hypotheses and recommendations in the CI artifact.

Read the guides in `docs/` in numeric order before running anything above smoke.

## Quick start
```bash
mise install
cp .env.example .env   # optional reference; runtime config stays in env vars
mise run lab           # terminal 1
SCENARIO=smoke K6_REPORT_DIR=artifacts/rest mise run rest
SCENARIO=smoke K6_REPORT_DIR=artifacts/graphql mise run graphql
SCENARIO=smoke K6_REPORT_DIR=artifacts/browser mise run frontend
mise run analyze
```

## Dynamic environment
The same scripts run in local/test/CI environments. Change only env vars such as `TARGET_BASE_URL`, `SCENARIO`, `BASELINE_RPS`, `PEAK_RPS`, NFR thresholds and Apdex T. Do not create `staging.js`, `prod.js`, etc. with credentials or hard-coded deploy config.

## Safe default
The pipeline starts the repository's own instrumented Node target and runs only the `smoke` profile by default. Higher-load scenarios are opt-in. Public demo systems are documented for learning, but aggressive load belongs on infrastructure you own or are explicitly authorized to test.

## Architecture
This project uses Ports & Adapters + Strategy. Saga is intentionally rejected because there is no distributed transaction/compensation problem to solve. See `docs/architecture.md`.

## CI evidence
GitHub Actions always uploads:
- raw k6 `summary.json` for REST, GraphQL and browser;
- `performance-diagnosis.md`;
- machine-readable `performance-diagnosis.json`;
- runner CPU/memory and local target configuration/metrics/logs.

Threshold failures still generate evidence before the final quality gate fails the workflow.
