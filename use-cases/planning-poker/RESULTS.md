# Planning Poker controlled realtime results

This document records one reproducible controlled-lab execution of the Planning Poker Socket.IO workload. It is evidence about the tested Docker configuration only; it is **not** a production capacity claim.

## Execution

- k6 benchmark repository branch: `agent/planning-poker-use-case`
- benchmark head: `5d5963b973281ed7fc0c5dd2806780457895f1ea`
- target source: `ljeronimodarocha/planer-poker@c501fef57a288843546ad9f8355e1a2d0af475bc`
- GitHub Actions run: `32535960175`
- target runtime: disposable Node 26 Docker container
- persistence: fresh SQLite database per scenario
- workload meaning: `1 VU = 1 participant = 1 Socket.IO connection`

## Results

| Scenario | Rooms | Users / room | VUs / sockets | Arrival window | Checks | Session failures | Connect p95 | Join ACK p95 | Vote ACK p95 | Consensus ACK p95 | `room:state` events | Payload p95 | k6 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 1 | 5 | **5** | immediate | 100% | 0% | 12.40 ms | 5.60 ms | 2.00 ms | 5.00 ms | 50 | 745.0 B | pass |
| load | 4 | 5 | **20** | 10 s | 100% | 0% | 4.30 ms | 2.10 ms | 1.00 ms | 4.85 ms | 200 | 745.0 B | pass |
| stress | 10 | 5 | **50** | 15 s | 100% | 0% | 2.55 ms | 2.00 ms | 1.00 ms | 5.00 ms | 500 | 745.0 B | pass |
| spike | 20 | 5 | **100** | 1 s | 100% | 0% | 4.00 ms | 2.05 ms | 1.00 ms | 6.25 ms | 1000 | 745.2 B | pass |

Every scenario generated its own self-contained k6 `report.html`, plus `summary.json`, `timeseries.json`, `test-window.json` and Docker evidence.

## What this execution supports

Under this controlled local configuration, increasing total concurrent participants from 5 to 100 by increasing the number of independent five-person rooms did not produce a material client-visible latency increase or protocol/business failure.

The spike case created 20 independent rooms and 100 Socket.IO participants within a one-second arrival window and still completed with 100% checks and zero session/ACK failures under the provisional laboratory thresholds.

Consensus ACK p95 moved from approximately 5 ms to 6.25 ms at the 100-VU spike. The absolute difference is small and is not sufficient evidence of a bottleneck.

## What this execution does **not** prove

### It does not prove production capacity

The VU values are synthetic calibration points. They were not derived from production telemetry, and the Docker runner is not established as production-equivalent infrastructure.

### It does not validate the room-size broadcast fan-out hypothesis

All four scenarios intentionally kept room size constant at five participants. `room:state` events therefore scaled approximately linearly with total VUs:

```text
5 VUs   ->   50 room:state deliveries
20 VUs  ->  200 room:state deliveries
50 VUs  ->  500 room:state deliveries
100 VUs -> 1000 room:state deliveries
```

This matrix increases the **number of rooms**, not the **number of participants inside one room**. It is useful for system-wide connection concurrency and concurrent persistence pressure, but it does not test the architectural hypothesis that state delivery work can grow roughly with `participants × participants` inside a single busy room.

A separate controlled fan-out experiment should therefore hold room count constant and increase participants per room, for example:

```text
1 room x 5 participants
1 room x 10 participants
1 room x 20 participants
1 room x 40 participants
```

That experiment should compare broadcast deliveries, payload serialization/network volume, event-loop behavior and vote/consensus latency as room size grows.

## Interpretation discipline

The correct conclusion from this run is:

> The tested Node 26 + SQLite Docker target completed the controlled 5/20/50/100-VU multi-room Socket.IO matrix without observed client failures or meaningful latency degradation. Production capacity remains unknown, and the single-room broadcast fan-out hypothesis remains untested.

This preserves the distinction between **observed evidence**, **architecture hypotheses**, and **production claims**.
