# [Architecture] Make room state safe for horizontal scaling

## Summary

The performance study confirmed that the application can handle the tested single-process workloads, but it also identified a **high architectural scaling risk**: active room state is stored in a process-local `Map`.

That design is efficient for one Node.js process, but it means transparent horizontal scaling is not guaranteed. With multiple replicas, participants in the same logical room can be routed to different processes unless connection affinity and shared state/broadcast coordination are explicitly designed.

This issue is not based on a production failure. It is a **design risk identified during the performance architecture review** and should be addressed before using additional replicas as the primary scaling strategy.

## 5W2H

### What
Define and implement an explicit multi-replica architecture for Planning Poker room state and Socket.IO broadcasts.

### Why
Room state currently lives in a process-local `Map`. Adding replicas without a coordination strategy can create:

- inconsistent room membership/state between replicas;
- missed or partial `room:state` broadcasts;
- host/round state divergence;
- reconnect behavior that depends on which instance receives the socket;
- misleading performance gains that trade correctness for throughput.

### Where
Primary areas:

- `server/src/rooms.js` — process-local room state
- Socket.IO server/adapter configuration
- load balancer/session-affinity configuration
- persistence/recovery path through Prisma/SQLite or a future shared store

### When
Before deploying multiple backend replicas or treating horizontal scaling as the fix for the large-room broadcast bottleneck.

### Who
Backend/realtime architect plus platform/infrastructure owner, with QA/performance validation.

### How
Evaluate and document one supported topology, for example:

1. **Sticky sessions + explicit shared Socket.IO adapter/state**, or
2. **Shared authoritative room state** with pub/sub for realtime propagation, or
3. another design that guarantees room consistency across replicas.

Then validate it with a two-replica test:

- place a load balancer in front of two Node processes;
- intentionally distribute joins/connections across replicas;
- validate create/join/vote/reveal/consensus consistency;
- verify all participants receive the same final state;
- compare latency and outbound traffic with the single-process baseline;
- repeat with and without affinity if both modes are expected to be supported.

### How much
Estimated engineering effort: **medium-to-high**, depending on the selected shared-state/Socket.IO adapter strategy and deployment stack.

## Diagnosis

**Severity:** HIGH architectural risk  
**Status:** Confirmed design limitation; multi-replica failure mode not yet experimentally exercised

The current benchmark deliberately used one target process, so it does not claim that multi-replica behavior is broken. The evidence-based conclusion is narrower: **the current in-memory room model makes horizontal scaling non-transparent and requires an explicit correctness/performance design before it can be relied on**.

The large-room fan-out issue should still be optimized independently; horizontal scaling should not be used to hide a near-quadratic per-room message pattern.

## Reports and reproducibility

- Full diagnosis: https://github.com/carlacazv/k6-benchmark-lab/blob/agent/planning-poker-use-case/use-cases/planning-poker/FINAL-REPORT.md
- Benchmark PR: https://github.com/carlacazv/k6-benchmark-lab/pull/10
- Realtime/fan-out run: https://github.com/carlacazv/k6-benchmark-lab/actions/runs/32536979724
- Target source tested: `c501fef57a288843546ad9f8355e1a2d0af475bc`

The performance study found the first confirmed bottleneck in full-state Socket.IO fan-out. This issue addresses the separate scale-out correctness/performance risk exposed by the architecture review.