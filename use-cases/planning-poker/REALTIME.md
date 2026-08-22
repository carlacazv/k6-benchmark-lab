# Planning Poker realtime workload matrix

The browser smoke proves the end-to-end UI path. This companion workload exercises the primary realtime protocol directly so concurrency can scale without using one Chromium instance per participant.

## Workload meaning

For these controlled CI experiments:

```text
1 VU = 1 Planning Poker participant = 1 Socket.IO connection
```

Participants are grouped into rooms. Each room contains one host and four additional participants. The host reconnects to a fixture created during `setup()`, starts a round, every connected participant votes, and the host persists consensus.

The Socket.IO wire protocol is exercised directly over Engine.IO WebSocket transport at:

```text
/realtime/?EIO=4&transport=websocket
```

The adapter implements the protocol framing needed by this application: Engine.IO open/ping/pong, Socket.IO namespace connect, EVENT packets and ACK packets.

## Initial controlled CI matrix

| Scenario | Rooms | Participants / room | VUs | Active sockets | Arrival window |
|---|---:|---:|---:|---:|---:|
| baseline | 1 | 5 | **5** | **5** | immediate |
| load | 4 | 5 | **20** | **20** | 10 s |
| stress | 10 | 5 | **50** | **50** | 15 s |
| spike | 20 | 5 | **100** | **100** | 1 s |

These values are **synthetic controlled-lab calibration points**, not discovered production traffic. They must not be presented as production capacity, production SLO validation, or a recommendation that 100 users is the product's real peak.

The production-readiness methodology still requires real workload telemetry, environment parity and observability before translating this matrix into a production-equivalent load model.

## Business flow per room

```text
setup
  -> create room
  -> add one story
  -> host disconnects
  -> room is reconstructable from SQLite

workload
  -> 5 VUs connect through Engine.IO/WebSocket
  -> all join the same room
  -> host starts the round
  -> all 5 VUs select a card
  -> room:state broadcasts fan out to the room
  -> round becomes revealed
  -> host records consensus
  -> Prisma/SQLite persists Round + Estimates + Story update
  -> all VUs observe the persisted final room state
```

This deliberately exercises the architecture risks identified during source review: connection/join bursts, full-room broadcast fan-out, event-loop/serialization pressure and concurrent SQLite writes across rooms.

## Metrics

The report includes native k6 WebSocket metrics plus:

- `planning_poker_socket_connect_ms`
- `planning_poker_room_join_ack_ms`
- `planning_poker_round_start_ack_ms`
- `planning_poker_round_select_ack_ms`
- `planning_poker_consensus_ack_ms`
- `planning_poker_room_state_events`
- `planning_poker_room_state_bytes`
- `planning_poker_ack_failures`
- `planning_poker_session_failures`

The `room:state` event count is especially relevant because every state-changing action broadcasts the full room snapshot to every socket in that room.

## Run locally

Start an authorized local Planning Poker target first, then run one scenario:

```bash
mise run case-planning-poker-baseline
mise run case-planning-poker-load
mise run case-planning-poker-stress
mise run case-planning-poker-spike
```

Each task writes a self-contained visual k6 dashboard:

```text
artifacts/use-cases/planning-poker/<scenario>/report.html
```

alongside:

```text
summary.json
timeseries.json
test-window.json
```

## CI behavior

CI builds the pinned Planning Poker source into a disposable Node 26 Docker image. Each scenario gets a fresh container and fresh SQLite database so baseline, load, stress and spike do not contaminate each other's state.

All four scenarios are executed even when a higher-load case violates a provisional threshold. A stress/spike threshold failure is evidence and should remain visible. The CI infrastructure gate instead verifies that every scenario actually ran and produced its HTML + raw evidence.

The Job Summary compares all four scenarios side by side, including VUs/sockets, checks, session failures, connection/join/vote p95, broadcast count, payload size and the k6 exit result.
