# Use case: Planning Poker real-time application

This case study shows how to apply `k6-benchmark-lab` to a real external application without starting by guessing a VU count.

Target repository: <https://github.com/ljeronimodarocha/planer-poker>

Source inspected and executed by CI for this case: `main@c501fef57a288843546ad9f8355e1a2d0af475bc`.

## 1. What the discovery tells us

The application is a real-time Planning Poker system:

- React 19 + Vite frontend;
- Fastify backend;
- Socket.IO on `/realtime` for the core collaborative flows;
- Prisma + SQLite for persistence;
- in-memory room state in a process-local `Map`;
- REST is secondary: health/export endpoints are not the main user workload.

The important consequence is that a REST-only performance test would model the wrong system behavior.

The business flow is primarily:

```text
browser
  -> Socket.IO connection
  -> room:create / room:join
  -> room:state broadcasts
  -> story:add
  -> round:start
  -> round:select
  -> room:state broadcasts
  -> round:consensus
  -> Prisma / SQLite persistence
```

## 2. Performance risks discovered from the architecture

### Join and reconnect bursts

Every participant entering a room changes the room state and triggers a broadcast. A meeting starting at the same time can therefore create a short connection/join burst that is more relevant than a flat REST request rate.

### Voting fan-out

Every `round:select` updates the in-memory selection and broadcasts the full room snapshot to the room. With `N` connected participants selecting once in a round, the server can produce roughly `N x N` state deliveries for that round before considering protocol overhead and payload growth.

That makes **participants per room** a first-class workload dimension, not just total VUs.

### SQLite write contention

Room creation, story creation and consensus persist through Prisma. Consensus also creates the round/estimate records and updates the story. Multiple active rooms finishing rounds concurrently can therefore expose SQLite write serialization or lock/wait behavior.

### Event-loop and memory pressure

Rooms are held in process memory and Socket.IO runs in the Node.js process. CPU/event-loop lag, heap/RSS, active sockets, serialization cost and broadcast volume should be observed together with client latency.

### Scale-out assumptions

Process-local room state means horizontal scaling cannot be treated as transparent. A multi-process deployment needs an explicit state/session/broadcast strategy before a multi-replica load result can be interpreted as production-equivalent.

This is an architectural risk to investigate, not a conclusion from a performance test.

## 3. Why this use case starts with browser smoke

The first executable test deliberately uses `k6/browser` and creates a room through the real UI.

That flow exercises:

```text
static frontend
  -> React
  -> socket.io-client
  -> /realtime
  -> room:create
  -> Prisma
  -> SQLite
  -> room:created / room:state
  -> UI renders the room code
```

This is much more representative than calling `/api/health` and declaring the application ready for load.

The smoke test is **not** the load generator for hundreds of concurrent participants. Browser VUs are expensive and should not be used to fake protocol-scale concurrency.

For load/stress/spike testing, the next adapter should model the Socket.IO/Engine.IO protocol directly and preserve the same business semantics.

## 4. Safe local setup

Run the target on infrastructure you own or are explicitly authorized to test.

Clone the target separately:

```bash
git clone https://github.com/ljeronimodarocha/planer-poker.git
cd planer-poker
git checkout c501fef57a288843546ad9f8355e1a2d0af475bc
npm ci
DATABASE_URL=file:./dev.db npm run prisma:generate -w server
DATABASE_URL=file:./dev.db npm run prisma:migrate -w server
npm run build
DATABASE_URL=file:./dev.db npm start
```

The application should be available at:

```text
http://127.0.0.1:3000
```

Then, from `k6-benchmark-lab`:

```bash
mise install
mise run case-planning-poker-readiness
mise run case-planning-poker-smoke
```

If the target runs elsewhere, override the environment explicitly:

```bash
TARGET_BASE_URL=http://127.0.0.1:3000 mise run case-planning-poker-smoke
```

`k6/browser` needs a Chromium-compatible browser runtime available locally.

## 5. Docker execution in GitHub Actions

The repository CI runs this use case in an isolated job named `planning-poker-report`.

The job deliberately does not point k6 at an arbitrary deployed environment. Instead it:

```text
checkout k6-benchmark-lab
  -> clone the pinned Planning Poker commit
  -> start node:26-bookworm Docker container
  -> npm ci + Prisma generate/migrate + frontend build
  -> expose Planning Poker only on runner localhost:3000
  -> wait for /api/health
  -> execute readiness
  -> run 5 k6/browser smoke iterations
  -> export HTML + raw evidence
  -> upload a dedicated artifact
  -> remove the container
```

This makes the example reproducible while keeping the target controlled and disposable.

The Docker container is also captured as evidence through its logs and `docker inspect` metadata.

## 6. Downloadable visual report

Every k6 execution through `scripts/run-k6-with-window.mjs` now exports the built-in k6 web dashboard as a self-contained HTML file.

For Planning Poker, the artifact contains:

```text
artifacts/use-cases/planning-poker/
├── readiness/
│   ├── readiness-report.md
│   ├── readiness.json
│   └── runtime.env
├── browser/
│   ├── report.html        # open this in a browser
│   ├── summary.json
│   ├── timeseries.json
│   └── test-window.json
└── container/
    ├── stdout.log
    └── inspect.json
```

In GitHub Actions, download the artifact named:

```text
planning-poker-performance-<run-id>
```

Then open:

```text
browser/report.html
```

The HTML is the human-facing result. The JSON and time-series files remain the auditable raw evidence used for deeper analysis.

The Actions job summary also prints a compact table with iterations, room-creation p50/p90/p95/p99 and check success rate so the result can be triaged without downloading anything.

## 7. What the smoke test proves

`browser-smoke.js` checks that:

- the application document loads successfully;
- a host can submit the create-room flow;
- the Socket.IO-backed flow completes;
- the UI receives a valid five-character room code;
- the end-to-end room-creation duration is recorded as `planning_poker_room_create_ms`;
- Apdex evidence is produced through the same lab helper used by the built-in adapters.

The CI uses five iterations to produce a useful short time series while remaining a smoke test rather than a capacity test.

The local plan contains provisional smoke guardrails only. They are explicitly **not production NFRs**.

## 8. What we still need before real load

Do not jump from this smoke to `100`, `500` or `1000` VUs.

For a defensible load model, collect:

| Question | Evidence to obtain |
|---|---|
| How many simultaneous sessions exist? | production/business telemetry |
| Typical and peak participants per room? | room/session analytics |
| How often are stories estimated? | events per session / meeting duration |
| What is the busiest join window? | connection/join timestamps |
| What latency is acceptable for create/join/vote/reveal? | agreed NFR/SLO |
| What is the production CPU/memory/replica topology? | deployment configuration |
| Is production still SQLite? | database topology |
| What is observable? | app/infra/log/trace inventory |

Only after these inputs exist should `performance-test-plan.yaml` be evolved from `sanity` into `baseline`, `load`, `stress`, `spike`, `soak` or `breakpoint`.

## 9. Recommended workload model

The real-time workload should model **rooms and participants**, not only requests per second.

Example dimensions to derive from telemetry:

```text
rooms concurrently active
participants per room
new joins per second
connected socket duration
stories per session
votes per participant per round
rounds per story
room-state broadcasts per second
consensus writes per second
```

A representative protocol test should create independent room cohorts and preserve ordering:

```text
host creates room
  -> participants join
  -> host adds story
  -> host starts round
  -> participants vote in a realistic time distribution
  -> state is revealed
  -> host records consensus
  -> optional next story / think time
  -> participants leave
```

A spike case is particularly relevant for the start of a refinement meeting, where many participants can connect/join within a short interval.

## 10. Telemetry required for diagnosis

Client-side k6 evidence:

- connect/join/create/vote/consensus latency;
- failed Socket.IO acknowledgements;
- disconnects/timeouts;
- dropped iterations;
- room-state event latency and count;
- end-to-end browser flow latency for a small validation cohort.

Server-side evidence:

- Node.js event-loop lag/utilization;
- CPU;
- heap/RSS and GC;
- active Socket.IO connections;
- socket events in/out per second;
- bytes broadcast per second;
- room-state serialization time/size;
- Prisma query duration;
- SQLite busy/lock/write wait indicators;
- request/socket errors;
- process restarts.

The test window must be correlated with these metrics before claiming a bottleneck.

## 11. Hypotheses worth validating later

These are investigation hypotheses, not findings:

1. **Broadcast fan-out hypothesis** — latency increases materially as participants per room grows because each vote triggers a full-state broadcast.
2. **SQLite write-contention hypothesis** — concurrent room consensus writes increase DB wait and tail latency.
3. **Event-loop saturation hypothesis** — high socket event/broadcast rates increase event-loop lag before CPU reaches an obvious host-level limit.
4. **Large-room payload hypothesis** — larger room snapshots increase serialization and outbound network cost.

The framework's normal evidence chain still applies:

```text
k6 symptom
  -> exact test window
  -> aligned system telemetry
  -> correlation
  -> hypothesis
  -> controlled experiment
  -> supported / contradicted / inconclusive
```

## 12. Why this case matters to the lab

This target exposes an important boundary in the current adapters:

- REST adapter: insufficient for the primary workflow;
- GraphQL adapter: not applicable;
- browser adapter: excellent for correctness + end-to-end smoke, inefficient for protocol-scale load;
- dedicated Socket.IO adapter: the correct next extension for representative concurrency.

That is exactly the behavior this lab is intended to teach: **choose the workload and protocol from the system architecture and business flow, not from the tool you already happen to have.**
