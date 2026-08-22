# [Performance] Isolate Prisma/SQLite contention with synchronized consensus writes

## Summary

The controlled Planning Poker benchmark did **not** identify SQLite as the first bottleneck at the tested scale. Multi-room scenarios up to 100 concurrent sockets completed with 100% checks and 0% session/ACK failures, and consensus ACK p95 remained in the low-millisecond range for the distributed-room matrix.

However, the existing scenarios do not intentionally maximize simultaneous persistent writes. Because `round:consensus` persists Round/Estimate data and updates Story state through Prisma/SQLite, a dedicated synchronized-write experiment is required before ruling out database contention at higher write concurrency.

## 5W2H

### What
Add a performance scenario that synchronizes many independent rooms so they execute `round:consensus` writes at approximately the same instant.

### Why
The current benchmark primarily exposed Socket.IO broadcast amplification. SQLite showed no `busy`, lock, timeout or application error messages in the captured runs, but absence of failure in the current workload does not prove write scalability under a deliberately adversarial write burst.

A focused experiment will distinguish database contention from realtime fan-out pressure and prevent premature architectural conclusions.

### Where
Primary path:

- `server/src/rooms.js` — `consensus()`
- Prisma Round/Estimate creation
- Prisma Story update
- SQLite file locking/write path

### When
After or in parallel with Socket.IO fan-out optimization, and before increasing persistent write throughput expectations or changing the database solely on assumption.

### Who
Backend/database owner with QA/performance support.

### How
1. Create many isolated rooms and stories.
2. Join a realistic small number of participants per room so broadcast fan-out remains controlled.
3. Start and reveal rounds independently.
4. Synchronize hosts so `round:consensus` is emitted in a narrow time window.
5. Run increasing write-concurrency points (for example 5, 10, 20, 40, then higher only if the environment remains healthy).
6. Capture:
   - consensus ACK p50/p95/p99;
   - Prisma query duration;
   - SQLite lock/wait or `busy` errors;
   - application errors/timeouts;
   - process CPU/event-loop delay;
   - completed writes per second.
7. Use a fresh database per scenario and preserve raw artifacts.

### How much
Estimated engineering effort: **small-to-medium** because the existing protocol workload, Docker isolation and report pipeline can be reused.

## Diagnosis

**Severity:** LOW / UNPROVEN at current tested scale  
**Status:** No contention observed yet; dedicated test required

Current evidence:

- multi-room 5/20/50/100-socket scenarios: 100% checks, 0% session failures;
- consensus ACK p95 stayed roughly around 5–8 ms in the distributed-room matrix;
- no captured SQLite lock/`busy`/timeout errors;
- the 40-user single-room case increased consensus ACK p95 to 24 ms, but that scenario simultaneously amplified realtime traffic and therefore does not isolate the database.

The engineering recommendation is **not** to replace SQLite based on the current results. First isolate the write path and measure it.

## Reports and reproducibility

- Full diagnosis: https://github.com/carlacazv/k6-benchmark-lab/blob/agent/planning-poker-use-case/use-cases/planning-poker/FINAL-REPORT.md
- Benchmark PR: https://github.com/carlacazv/k6-benchmark-lab/pull/10
- Realtime/fan-out run: https://github.com/carlacazv/k6-benchmark-lab/actions/runs/32536979724
- Browser smoke run: https://github.com/carlacazv/k6-benchmark-lab/actions/runs/32536979700

This issue intentionally distinguishes a **testable database hypothesis** from the already confirmed full-state broadcast bottleneck.