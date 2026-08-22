# LinkedIn post — Planning Poker performance investigation

A performance test can be completely green and still miss the real scalability problem.

I recently used an open-source Planning Poker application as a real target for my k6 performance engineering lab. The application is built with React, Fastify, Socket.IO, Prisma and SQLite, so the most important workload is not REST — it is the realtime collaboration flow.

I started with the obvious checks:

- a real browser smoke test;
- Socket.IO protocol-level load;
- `1 VU = 1 participant = 1 socket`;
- isolated Docker target;
- fresh SQLite database per scenario;
- downloadable HTML reports and raw evidence for every run.

Then I ran this matrix:

- 5 VUs / 1 room
- 20 VUs / 4 rooms
- 50 VUs / 10 rooms
- 100 VUs / 20 rooms

Every room had five participants.

The result looked excellent: **100% checks, 0% session failures, and no meaningful client-visible degradation even at 100 concurrent sockets.**

It would have been very easy to stop there and say: “the system handles 100 users.”

But that conclusion would have been wrong.

The architecture had an interesting characteristic: after important state changes, the server broadcasts a complete `room:state` snapshot to everyone in the room.

So I changed the experiment.

Instead of increasing the total number of rooms, I kept **one room** and increased the number of participants:

- 5 participants
- 10 participants
- 20 participants
- 40 participants

That changed the story completely.

From 5 to 40 participants — only **8× more users** — I measured:

- `room:state` deliveries: **50 → 2,662 (53.24×)**
- total state traffic: **29.8 KiB → 5.07 MiB (174.64×)**
- vote ACK p95: **1 ms → 68.1 ms**
- join ACK p95: **2.8 ms → 36 ms**
- snapshot p95 size: **745 B → 2,858 B**

The fitted delivery curve was approximately **O(N^1.91)** — very close to quadratic.

And total state bytes grew even faster, around **O(N^2.48)**, because two costs compound:

1. more participants generate more state-changing operations;
2. each operation broadcasts to more participants;
3. the full snapshot itself becomes larger as the room grows.

The important part: **nothing actually failed.**

All checks still passed.

That means the benchmark found a scalability problem *before* reaching an outage threshold.

My diagnosis from the experiment:

**Confirmed bottleneck:** full-state Socket.IO broadcast amplification and payload growth.

**Probable next bottleneck:** Node.js event-loop / serialization pressure. Client latency increased with the message amplification, but I still need continuous event-loop, CPU, GC and serialization telemetry to prove causality.

**Not the first bottleneck at this scale:** SQLite. Consensus writes remained fast and I captured no lock/`busy` errors. I would test synchronized consensus writes separately before deciding the database needs to change.

**Architectural risk:** room state currently lives in a process-local `Map`, so horizontal scaling needs an explicit shared-state / Socket.IO adapter / connection-affinity strategy.

The biggest lesson for me was not about k6.

It was about **workload modeling**.

A VU count alone tells you almost nothing if you do not understand how users are distributed through the system.

`100 users across 20 small rooms` and `40 users inside one room` are completely different performance problems — even though the second test has fewer users.

Performance engineering becomes much more useful when the goal is not “generate load,” but:

**architecture → hypothesis → controlled experiment → evidence → diagnosis → next experiment.**

I documented the complete case, scripts, HTML reports, raw k6 evidence and final diagnosis here:

Benchmark: https://github.com/carlacazv/k6-benchmark-lab/pull/10

Target project: https://github.com/ljeronimodarocha/planer-poker

Thanks to the project author for making a small, real realtime application available — it turned into a very useful performance engineering case study.

#PerformanceEngineering #k6 #SoftwareQuality #SDET #SocketIO #NodeJS #Observability #PerformanceTesting #QualityEngineering #Architecture