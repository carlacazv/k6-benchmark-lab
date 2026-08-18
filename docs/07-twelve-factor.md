# 7. Twelve-factor mapping for the performance lab

The Twelve-Factor App methodology was created for applications, while this repository is a test harness. We apply the principles where they improve reproducibility and operational safety rather than forcing application architecture onto test code.

| Factor | Application in this lab |
|---|---|
| Codebase | One repository is the source of truth for test code, workload models, docs and CI. |
| Dependencies | Node and k6 versions are pinned in `mise.toml`; CI installs declared tooling rather than relying on workstation state. |
| Config | Target URLs, workload volume, NFRs, Apdex and synthetic target behavior are environment variables. Secrets must stay in CI secret stores, never in source. |
| Backing services | The system under test and its dependencies are treated as attached resources. Switching environments changes config, not test code. |
| Build, release, run | Source validation, CI configuration and test execution are separate concerns; a workflow run records the exact commit and runtime evidence. |
| Processes | k6 executions and the diagnosis step are stateless; durable evidence is written as artifacts. |
| Port binding | The controlled study target exposes itself through an explicit HTTP port and does not depend on an external app server. |
| Concurrency | Load is expressed explicitly through k6 executors, rates and VU allocation instead of hidden loops or machine-specific behavior. |
| Disposability | The study target and generators can start/stop quickly; tests should have bounded duration, stop criteria and recoverable teardown. |
| Dev/prod parity | The same scripts run everywhere; environment differences are config. Because performance depends on capacity, CPU/memory/topology differences must be captured as test evidence rather than ignored. |
| Logs | Processes write event information to stdout/stderr; CI captures logs instead of coupling test code to a log storage vendor. |
| Admin processes | One-off operations such as smoke, baseline or diagnosis are exposed as versioned `mise` tasks or explicit CI dispatches. |

Performance-specific addition: reproducibility also requires recording generator capacity, SUT capacity, dataset shape and dependency limits. Twelve-factor configuration alone does not make two performance environments equivalent.
