import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] || 'artifacts/use-cases/planning-poker';
const scenarios = ['baseline', 'load', 'stress', 'spike'];

const metricValues = (summary, name) => summary.metrics?.[name]?.values ?? {};
const num = (value, decimals = 2) => Number.isFinite(Number(value)) ? Number(value).toFixed(decimals) : 'n/a';
const pct = (value) => Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(2)}%` : 'n/a';

const rows = [];
for (const scenario of scenarios) {
  const summaryFile = path.join(root, scenario, 'summary.json');
  const windowFile = path.join(root, scenario, 'test-window.json');
  if (!fs.existsSync(summaryFile) || !fs.existsSync(windowFile)) continue;

  const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  const window = JSON.parse(fs.readFileSync(windowFile, 'utf8'));
  const meta = summary.meta ?? {};
  rows.push({
    scenario,
    rooms: meta.rooms,
    participants: meta.participantsPerRoom,
    vus: meta.vus,
    arrivalWindowMs: meta.arrivalWindowMs,
    checks: pct(metricValues(summary, 'checks').rate),
    failures: pct(metricValues(summary, 'planning_poker_session_failures').rate),
    connectP95: num(metricValues(summary, 'planning_poker_socket_connect_ms')['p(95)']),
    joinP95: num(metricValues(summary, 'planning_poker_room_join_ack_ms')['p(95)']),
    voteP95: num(metricValues(summary, 'planning_poker_round_select_ack_ms')['p(95)']),
    stateEvents: num(metricValues(summary, 'planning_poker_room_state_events').count, 0),
    stateBytesP95: num(metricValues(summary, 'planning_poker_room_state_bytes')['p(95)']),
    k6ExitCode: window.exitCode,
  });
}

console.log('## 🃏 Planning Poker realtime performance matrix');
console.log('');
console.log('`1 VU = 1 participant = 1 Socket.IO connection`');
console.log('');
console.log('| Scenario | Rooms | Users/room | VUs / sockets | Arrival window | Checks | Session failures | Connect p95 | Join ACK p95 | Vote ACK p95 | room:state events | Payload p95 | k6 |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const row of rows) {
  const result = Number(row.k6ExitCode) === 0 ? '✅' : `⚠️ ${row.k6ExitCode}`;
  console.log(`| ${row.scenario} | ${row.rooms} | ${row.participants} | **${row.vus}** | ${row.arrivalWindowMs} ms | ${row.checks} | ${row.failures} | ${row.connectP95} ms | ${row.joinP95} ms | ${row.voteP95} ms | ${row.stateEvents} | ${row.stateBytesP95} B | ${result} |`);
}
console.log('');
console.log('A non-zero k6 result in stress/spike is preserved as evidence rather than hidden. Each scenario has its own downloadable `report.html`.');

if (rows.length !== scenarios.length) {
  console.error(`Expected ${scenarios.length} scenario summaries, found ${rows.length}.`);
  process.exit(1);
}
