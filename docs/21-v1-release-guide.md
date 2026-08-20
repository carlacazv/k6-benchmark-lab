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

### Licensing

- [x] License selected: **Apache License, Version 2.0** (`Apache-2.0`).
- [x] Full license text is present in `LICENSE`.
- [x] Project attribution is present in `NOTICE`.
- [x] `package.json` declares `Apache-2.0`.
- [x] README and CONTRIBUTING describe the license consistently.

The project may be described as open source under Apache-2.0 once this licensing change is merged. The license is permissive and includes explicit copyright, contribution and patent-license terms; the repository's `LICENSE` remains the authoritative legal text.

## Tagging

After the final licensing change is merged and the resulting `main` commit is green:

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
