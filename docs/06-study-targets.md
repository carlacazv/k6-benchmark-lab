# 6. Safe study targets

1. **This repository's local lab app (default)** — safe for baseline/load/stress/spike/soak/breakpoint because you control it. Inject latency/errors/CPU work with environment variables.
2. **Grafana QuickPizza local Docker image** — `ghcr.io/grafana/quickpizza-local:latest`; excellent for realistic observability + k6 workshops. Run locally for meaningful load.
3. **quickpizza.grafana.com** — Grafana explicitly describes it as suitable for small-scale performance tests. Keep it small and educational; do not use it for stress/breakpoint.
4. **test.k6.io / test-api.k6.io** — official k6 examples useful for script practice and smoke checks, not for aggressive load.
5. **Third-party public GraphQL demos** — treat as functional/smoke only unless the owner explicitly authorizes load. For GraphQL load learning, use the local `/graphql` target in this repo.

The rule is simple: public accessibility is not permission to generate load.
