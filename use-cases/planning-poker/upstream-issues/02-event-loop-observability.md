# [Observability] Add event-loop, serialization and outbound-traffic telemetry for realtime performance

## Summary

The Planning Poker performance study found strong correlation between large-room message amplification and rising client-visible ACK latency, but the server does not currently expose enough continuous runtime telemetry to prove the exact internal saturation mechanism.

In the single-room fan-out experiment, growing one room from 5 to 40 participants increased vote ACK p95 from **1.0 ms to 68.1 ms**, join ACK p95 from **2.8 ms to 36.0 ms**, and connect p95 from **8.0 ms to 83.0 ms**, while `room:state` traffic grew from **29.8 KiB to 5.07 MiB**.

This strongly suggests increasing Node.js event-loop, serialization and outbound-message pressure, but causality is still **probable rather than confirmed** because peak CPU/event-loop/GC/serialization metrics were not captured continuously during the exact test window.

## 5W2H

### What
Add continuous runtime telemetry for the realtime server so performance tests can correlate client latency with internal saturation.

### Why
Without event-loop, CPU, GC and serialization telemetry, we can see degradation from the client side but cannot confidently determine whether the dominant internal cost is JSON serialization, Socket.IO broadcast work, GC, CPU saturation, network writes, or another server-side mechanism.

### Where
Primarily in the Fastify/Socket.IO server process and the monitoring/export layer used during tests.

Suggested measurements:

- Node `perf_hooks` event-loop delay/utilization
- process CPU
- RSS and heap used/total
- GC pause/count
- active Socket.IO connections
- Socket.IO events emitted per second
- `room:state` payload bytes emitted
- serialization duration for snapshots
- broadcast duration
- Prisma query duration
- SQLite write/lock timing

### When
Before the next large-room optimization experiment and before using performance results to make capacity or production-readiness claims.

### Who
Backend/realtime owner plus platform/observability support; QA/performance consumes the telemetry during benchmark runs.

### How
1. Add low-overhead server metrics around `broadcast()` and `snapshot()`.
2. Export runtime metrics in a scrapeable format (for example Prometheus-compatible metrics).
3. Record exact test start/end timestamps.
4. Sample continuously throughout each scenario instead of relying on post-test `docker stats`.
5. Correlate metrics with the existing k6 `summary.json`, `timeseries.json` and `test-window.json`.
6. Re-run the 5/10/20/40 single-room fan-out matrix.

### How much
Estimated engineering effort: **small-to-medium** for core Node metrics, **medium** if a complete dashboards/Prometheus stack is added.

## Diagnosis

**Severity:** MEDIUM-HIGH  
**Status:** Observability gap; event-loop/serialization pressure is probable but not yet causally confirmed

The study already proved that message amplification increases sharply with room size. This issue is required to turn the remaining internal bottleneck hypotheses into evidence.

## Reports and reproducibility

- Full diagnosis: https://github.com/carlacazv/k6-benchmark-lab/blob/agent/planning-poker-use-case/use-cases/planning-poker/FINAL-REPORT.md
- Benchmark PR: https://github.com/carlacazv/k6-benchmark-lab/pull/10
- Realtime/fan-out run: https://github.com/carlacazv/k6-benchmark-lab/actions/runs/32536979724

Observed functional result: 100% checks and 0% session/ACK failures across the tested protocol scenarios. The goal here is to identify saturation **before** failures appear.