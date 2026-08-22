# Planning Poker Performance Engineering — Final Report

**Target:** `ljeronimodarocha/planer-poker`  
**Target source:** `c501fef57a288843546ad9f8355e1a2d0af475bc`  
**Benchmark branch:** `agent/planning-poker-use-case`  
**Browser run:** `32536979700`  
**Realtime/fan-out run:** `32536979724`  
**Environment:** GitHub-hosted Ubuntu runner; target isolated in Docker; fresh SQLite database per protocol scenario.

## Executive conclusion

The tested application is healthy for the small-room workloads exercised in this controlled lab. The UI room-creation smoke passed, and the multi-room Socket.IO matrix completed successfully through **100 concurrent VUs / 100 sockets** with **100% checks and 0% session/ACK failures**.

The principal scaling risk is **not total socket count at the tested level; it is participants per room**.

When a single room grew from **5 to 40 participants (8× users)**:

- delivered `room:state` events grew from **50 to 2,662 (53.24×)**;
- total observed `room:state` bytes grew from **30,465 B to 5,320,407 B (174.64×)**;
- p95 snapshot size grew from **745 B to 2,858 B (3.84×)**;
- vote ACK p95 grew from **1.0 ms to 68.1 ms (68.1×)**;
- join ACK p95 grew from **2.8 ms to 36.0 ms (12.86×)**;
- connect p95 grew from **8.0 ms to 83.0 ms (10.38×)**.

A log-log fit across the four fan-out points gives approximately **O(N^1.91)** growth in state deliveries, close to quadratic. Total state bytes grow approximately **O(N^2.48)** because both the number of broadcasts and the size of each full-room snapshot increase.

**Verdict:** the suspected full-state broadcast fan-out is **supported by the experiment** and is the first architectural bottleneck to address before claiming large-room scalability.

## Scenario results

### 1. Browser end-to-end smoke

| Metric | Result |
|---|---:|
| Browser VUs | 1 |
| Iterations | 5 |
| Checks | 100% |
| Browser HTTP failures | 0% |
| Room creation avg | 443.2 ms |
| Room creation p50 | 373.0 ms |
| Room creation p95 | 661.2 ms |
| Room creation p99 | 717.8 ms |
| Room creation max | 732.0 ms |
| FCP p95 | 345.6 ms |
| LCP p95 | 345.6 ms |
| TTFB p95 | 45.0 ms |
| CLS p95 | 0.00 |

**Interpretation:** the real browser path — frontend load, React interaction, Socket.IO room creation, Prisma/SQLite write and UI rendering — is healthy in the smoke workload. This is correctness/end-to-end evidence, not capacity evidence.

### 2. Multi-room concurrency

| Scenario | Rooms | Users/room | VUs/sockets | Arrival | Checks | Failures | Connect p95 | Join p95 | Vote p95 | Consensus p95 | State events | State bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 1 | 5 | 5 | 0 ms | 100% | 0% | 7.80 ms | 2.80 ms | 1.00 ms | 5.00 ms | 50 | 29.8 KiB |
| load | 4 | 5 | 20 | 10000 ms | 100% | 0% | 3.30 ms | 2.00 ms | 1.00 ms | 5.00 ms | 200 | 119.0 KiB |
| stress | 10 | 5 | 50 | 15000 ms | 100% | 0% | 2.55 ms | 2.00 ms | 1.00 ms | 7.75 ms | 500 | 297.5 KiB |
| spike | 20 | 5 | 100 | 1000 ms | 100% | 0% | 3.10 ms | 1.00 ms | 1.00 ms | 5.05 ms | 1000 | 596.7 KiB |

**Interpretation:** with room size fixed at five, increasing aggregate concurrency to 100 sockets did not create meaningful client-visible degradation. `room:state` deliveries stayed effectively linear with total participants (about 10 deliveries per participant in this modeled flow). SQLite consensus writes also remained low-latency at this scale. This does **not** prove production capacity.

### 3. Single-room fan-out

| Scenario | Users in one room | Checks | Failures | Connect p95 | Join p95 | Vote p95 | Consensus p95 | State events | Payload p95 | Total state bytes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| fanout-5 | 5 | 100% | 0% | 8.00 ms | 2.80 ms | 1.00 ms | 4.00 ms | 50 | 745 B | 29.8 KiB |
| fanout-10 | 10 | 100% | 0% | 16.00 ms | 4.55 ms | 2.00 ms | 6.00 ms | 175 | 1050 B | 138.1 KiB |
| fanout-20 | 20 | 100% | 0% | 25.05 ms | 11.05 ms | 22.05 ms | 6.00 ms | 650 | 1654 B | 775.1 KiB |
| fanout-40 | 40 | 100% | 0% | 83.00 ms | 36.00 ms | 68.10 ms | 24.00 ms | 2662 | 2858 B | 5.07 MiB |

## What the fan-out experiment proves

The application broadcasts a **complete `room:state` snapshot** after state-changing operations such as join and vote. As room membership grows, two costs compound:

1. more state-changing operations occur because more participants join and vote;
2. each operation broadcasts to more connected participants;
3. each snapshot becomes larger because participant/selection state itself grows.

The measurements are consistent with that mechanism:

| Growth from 5 → 40 participants | Factor |
|---|---:|
| Participants | 8× |
| `room:state` deliveries | 53.24× |
| Total `room:state` bytes | 174.64× |
| Snapshot p95 size | 3.84× |
| Connect p95 | 10.38× |
| Join ACK p95 | 12.86× |
| Vote ACK p95 | 68.10× |
| Consensus ACK p95 | 6.00× |

State-delivery growth is approximately **O(N^1.91)** in this experiment. That is strong evidence of near-quadratic message amplification. Total bytes grow faster because snapshot size also grows with `N`.

## Bottlenecks and problems

### A. Confirmed: full-state broadcast amplification — HIGH

**Evidence:** 8× more participants produced 53.24× more `room:state` deliveries and 174.64× more state bytes.

**Why:** every relevant mutation calls a full-room broadcast, and each connected member receives the full snapshot.

**Likely impact at larger room sizes:** rapidly rising serialization work, event-loop work, outbound bytes and client message processing even before request/ACK thresholds fail.

**Recommended change:** replace unnecessary full snapshots with minimal delta events; batch/debounce high-frequency updates; keep vote values private until reveal while broadcasting only the minimum information required by the UI.

### B. Confirmed: snapshot payload growth — HIGH

**Evidence:** p95 snapshot size increased from 745 B to 2,858 B as the room grew 5→40 participants, while total state traffic reached ~5.07 MiB in a single short 40-person round.

**Why:** the snapshot contains room participants and round selections, so message size grows with room state while message count also grows.

**Recommended change:** define event-specific payload contracts (`participant:joined`, `round:selection-status`, `round:revealed`, etc.) and reserve full snapshots for initial synchronization/recovery.

### C. Probable: Node event-loop / serialization pressure — MEDIUM-HIGH

**Evidence:** vote ACK p95 rose 68× and join ACK p95 12.86× while broadcast work accelerated. No functional errors occurred.

**Why it is not yet marked confirmed:** the target currently lacks continuous event-loop utilization/lag and serialization-duration telemetry, so client latency can be correlated with message amplification but not yet causally attributed to event-loop saturation.

**Next evidence needed:** `perf_hooks` event-loop delay/utilization, CPU time, GC, heap, serialization duration and bytes emitted per broadcast sampled during the exact test window.

### D. Not observed at tested range: SQLite write contention — LOW/UNPROVEN

The multi-room matrix synchronized multiple independent room workflows and still kept consensus ACK p95 around 5–8 ms. The single-room 40-user case reached 24 ms.

There were no `busy`, lock, timeout or error messages in captured target logs. This does **not** rule out SQLite contention at substantially higher concurrent write rates; it means SQLite was not the first bottleneck exposed by these scenarios.

**Next test:** many rooms reaching `round:consensus` at the same instant, with Prisma query duration and SQLite lock/wait telemetry.

### E. Architectural risk: process-local room state — HIGH for horizontal scaling

Rooms are stored in a process-local `Map`. The current one-process test cannot validate transparent horizontal scaling. Multiple Node replicas could create correctness and performance problems unless connection affinity and shared room/broadcast state are designed explicitly.

**Next test:** two replicas behind a load balancer, with and without sticky sessions/shared Socket.IO adapter, validating room consistency and broadcasts.

### F. Test/observability gap: infrastructure saturation is not continuously measured — MEDIUM

The suite captures container `docker stats` after each scenario. That snapshot showed memory increasing only modestly (roughly 85 MiB to 93 MiB in the 5→40 single-room comparison) and no obvious memory issue, but post-test CPU was 0% and cannot explain peak behavior.

**Recommended change:** scrape CPU, RSS/heap, event-loop lag, GC, socket count, network bytes and DB timings continuously throughout the test window.

## Problems not observed

- no WebSocket upgrade failures;
- no Socket.IO ACK failures;
- no session failures;
- no browser HTTP failures in the UI smoke;
- no captured application error/timeout/SQLite lock messages;
- no threshold breach with the current provisional 2-second protocol p95 guardrail.

The absence of failures must not be interpreted as unlimited capacity. The fan-out curve shows a scaling problem **before** failure.

## Recommended engineering priority

1. **P0 — Reduce `room:state` fan-out and payload size.**
2. **P0 — Add event-loop, serialization and outbound-byte instrumentation.**
3. **P1 — Re-run the same 5/10/20/40 fan-out matrix after optimization and compare curves.**
4. **P1 — Add synchronized multi-room consensus-write stress to isolate SQLite/Prisma contention.**
5. **P1 — Validate two-replica behavior because room state is process-local.**
6. **P2 — Add soak testing for socket lifecycle/memory leaks after the message-amplification issue is addressed.**
7. **P2 — Replace provisional lab thresholds with production-derived SLO/NFR values before making release/capacity claims.**

## Final assessment

**Current status: conditionally healthy for small rooms; architectural scaling issue identified for large rooms.**

The local benchmark supports up to 100 concurrent sockets when they are distributed across small five-person rooms, but the single-room experiment shows that room-size growth causes near-quadratic broadcast amplification and rapidly rising network/message-processing cost. At the tested scale, the system still completes successfully, so this is a **capacity precursor rather than an outage threshold**.

The first optimization target should be the Socket.IO state-distribution model, not SQLite.
