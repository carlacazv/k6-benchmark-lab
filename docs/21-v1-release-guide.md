# v1.0 Release Guide

The v1 release represents a **Performance Engineering decision model for QAs/SDETs**, not simply the seventh project phase.

## Release definition

v1 is ready when another QA can:

1. understand the model from `README.md` + `docs/00-start-here.md`;
2. choose a scenario from a business/system question;
3. copy the templates without reading engine source code;
4. run the safe smoke path;
5. understand why higher load is explicit;
6. inspect artifacts and distinguish observations from hypotheses;
7. understand `SUPPORTED` vs `ALIGNED` and their limitations;
8. reproduce the owned-lab Prometheus evidence chain.

## Automated release checks

Run:

```bash
mise run release-qc
mise run test
```

Before tagging the final merge, the GitHub Actions `performance-lab` workflow must also be green, including:

- smoke protocols;
- readiness/discovery;
- synthetic plumbing guardrail;
- real Prometheus validation;
- controlled experiment;
- evidence-chain alignment;
- artifact upload;
- final quality gate.

## Human release checks

### Documentation

- [ ] README describes the current product, not the implementation history.
- [ ] Start Here works for a new QA.
- [ ] Decision tree does not imply every scenario must always run.
- [ ] Templates use placeholders where provider-specific data is required.
- [ ] Troubleshooting does not recommend weakening gates to force green CI.
- [ ] Correlation/causality language is consistent.

### Safety

- [ ] PR/push ordinary performance path remains smoke-only.
- [ ] Fault injection cannot target arbitrary remote systems.
- [ ] Secrets remain environment-based.
- [ ] Synthetic telemetry cannot complete operational RCA/evidence-chain gates.

### Evidence

- [ ] A final CI artifact exists for the v1 release commit.
- [ ] Real Prometheus provenance is non-synthetic.
- [ ] The observability run has enough matched buckets.
- [ ] The known dependency-latency hypothesis is generated from telemetry.
- [ ] The separate controlled experiment remains `SUPPORTED`.
- [ ] Final evidence-chain status remains `ALIGNED`.

## Licensing decision

This repository intentionally does **not** invent a legal license on behalf of the owner.

Before advertising the project as OSI-licensed "open source", the repository owner should explicitly choose and add a license (for example MIT or Apache-2.0 after reviewing the implications). Until then, the source is publicly visible but reuse rights are not automatically granted.

This is the only v1 release item that is intentionally a human/legal decision rather than an engineering automation.

## Tagging

After the final productization PR is merged and the release commit is green:

```text
v1.0.0
```

The release notes should summarize capabilities by user outcome:

- derive load from evidence;
- validate readiness;
- run safe k6 scenarios;
- correlate exact-window telemetry;
- generate evidence-backed hypotheses;
- validate hypotheses with controlled experiments;
- align real Prometheus evidence with experiment results;
- teach the same method through the QA playbook/templates.

Avoid release language such as "automatically finds the root cause". The model deliberately does not claim that.

## After v1

Use [`ROADMAP.md`](../ROADMAP.md). v1.x should focus on fixes, documentation and compatibility. New conceptual systems such as tracing/regression intelligence belong in a deliberate v2 discussion.
