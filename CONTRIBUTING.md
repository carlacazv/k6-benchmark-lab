# Contributing

Thanks for helping improve the Performance Engineering model for QAs and SDETs.

The project values **evidence, reproducibility, safe defaults and explicit limitations** over adding more load or more tooling.

## Before contributing

Read:

1. [`docs/00-start-here.md`](docs/00-start-here.md)
2. [`docs/17-qa-performance-playbook.md`](docs/17-qa-performance-playbook.md)
3. [`docs/18-scenario-decision-tree.md`](docs/18-scenario-decision-tree.md)

## Development setup

```bash
mise install
mise run test
mise run release-qc
```

Docker is required only for the real-Prometheus validation path:

```bash
mise run observability
# or
mise run full-validation
```

## What makes a good contribution

Good changes usually improve one of these:

- workload-modeling evidence;
- readiness checks;
- protocol/scenario coverage;
- observability adapters;
- statistical/data-quality guardrails;
- diagnostic reasoning;
- controlled experiment design;
- documentation or reproducibility;
- safe execution defaults.

## Engineering principles

### 1. Do not invent load without a model

New examples should explain where demand came from: business math, production telemetry or an explicitly synthetic learning fixture.

### 2. Correlation is not root cause

Do not introduce language that upgrades correlation, lag alignment or threshold overlap into causal proof.

Use the evidence ladder:

```text
observation
  -> correlation
  -> hypothesis
  -> controlled experiment
  -> evidence alignment
```

### 3. Synthetic evidence must stay labelled synthetic

Synthetic telemetry may validate framework plumbing and deterministic CI behavior. It must not produce operational RCA conclusions.

### 4. Safe CI is mandatory

PR/push CI must not silently increase to stress, soak or breakpoint traffic.

Aggressive scenarios belong only on owned or explicitly authorized infrastructure and should be opt-in.

### 5. Fault injection stays local

The built-in controlled experiment runner intentionally restricts interventions to the repository-owned lab and an allow-list of knobs. Do not weaken that boundary to make experiments more convenient.

### 6. Preserve evidence on failure

When possible, upload/save artifacts before the final quality gate so failures remain diagnosable.

### 7. One experiment, one changed variable

If a contribution adds a causal-validation example, control and treatment should use the same workload and differ by one declared intervention variable.

## Tests

At minimum run:

```bash
mise run test
mise run release-qc
```

Changes that affect the end-to-end evidence chain should also run:

```bash
mise run full-validation
```

A PR should not weaken thresholds or evidence requirements merely to make CI green. Fix the underlying test/design issue or document why the policy itself is changing.

## Documentation

Documentation is part of the product.

When adding a public-facing capability:

- update `README.md` only if it affects the main user path;
- add/adjust the numbered guide in `docs/`;
- update a template when users need to copy configuration;
- keep local Markdown links valid;
- run `mise run release-qc`.

## Pull request description

Include:

- problem/question being solved;
- what changed;
- evidence or tests used;
- safety/behavior impact;
- limitations or unresolved questions.

For performance conclusions, state the tested scope and environment instead of saying only "performance passed".

## Secrets and production data

Never commit:

- Prometheus tokens;
- Datadog API/application keys;
- credentials;
- private production logs;
- customer identifiers;
- raw sensitive traces.

Use environment variables/secrets and anonymized fixtures.

## Licensing note

Contributions do not automatically define the repository's legal license. The repository owner must explicitly select and add a license before describing the project as OSI-licensed open source.
