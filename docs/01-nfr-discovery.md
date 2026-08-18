# 1. Discover the non-functional acceptance criteria

Do not begin by choosing VUs. Begin by defining what “acceptable” means. Capture: critical journeys/operations, latency SLOs (prefer p95/p99, not averages), availability/error budget, required throughput, concurrency, business peak windows, data volume, dependency limits, recovery expectations and maximum acceptable resource utilization.

## Minimum interview
- Which operation is business-critical and what latency is acceptable at p95/p99?
- What error rate is acceptable under expected load?
- What throughput must the system sustain now and after the forecast horizon?
- Is autoscaling expected to react during the test? In how long?
- What failure behavior is acceptable at overload: queue, reject, degrade, or shed load?
- What external dependency quotas/rate limits exist?
- Which telemetry will prove or refute a bottleneck hypothesis?

If no NFR exists, the first deliverable is a proposed NFR with assumptions explicitly marked—not an invented pass/fail threshold hidden in code.
