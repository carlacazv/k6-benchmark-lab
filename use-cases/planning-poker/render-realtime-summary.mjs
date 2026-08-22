import fs from 'node:fs';

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('Usage: node render-realtime-summary.mjs <summary.json>');
  process.exit(2);
}

const summary = JSON.parse(fs.readFileSync(file, 'utf8'));
const metrics = summary.metrics ?? {};
const meta = summary.meta ?? {};
const values = (name) => metrics[name]?.values ?? {};
const number = (value, decimals = 2) => Number.isFinite(Number(value)) ? Number(value).toFixed(decimals) : 'n/a';
const percent = (value) => Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(2)}%` : 'n/a';
const p95 = (name, suffix = ' ms') => `${number(values(name)['p(95)'])}${values(name)['p(95)'] === undefined ? '' : suffix}`;

console.log(`## 🃏 Planning Poker Socket.IO — ${meta.scenario ?? 'unknown'}`);
console.log('');
console.log(`**Workload:** ${meta.rooms ?? 'n/a'} rooms × ${meta.participantsPerRoom ?? 'n/a'} participants = **${meta.vus ?? 'n/a'} VUs / ${meta.activeSockets ?? 'n/a'} active sockets**`);
console.log('');
console.log(`Arrival window: **${meta.arrivalWindowMs ?? 'n/a'} ms** — ${meta.workloadMeaning ?? '1 VU = 1 participant'}`);
console.log('');
console.log('| Metric | Result |');
console.log('|---|---:|');
console.log(`| Checks | ${percent(values('checks').rate)} |`);
console.log(`| Session failures | ${percent(values('planning_poker_session_failures').rate)} |`);
console.log(`| ACK failures | ${percent(values('planning_poker_ack_failures').rate)} |`);
console.log(`| Socket.IO connect p95 | ${p95('planning_poker_socket_connect_ms')} |`);
console.log(`| room:join ACK p95 | ${p95('planning_poker_room_join_ack_ms')} |`);
console.log(`| round:start ACK p95 | ${p95('planning_poker_round_start_ack_ms')} |`);
console.log(`| round:select ACK p95 | ${p95('planning_poker_round_select_ack_ms')} |`);
console.log(`| round:consensus ACK p95 | ${p95('planning_poker_consensus_ack_ms')} |`);
console.log(`| room:state events | ${number(values('planning_poker_room_state_events').count, 0)} |`);
console.log(`| room:state payload p95 | ${number(values('planning_poker_room_state_bytes')['p(95)'])} bytes |`);
console.log('');
console.log('The downloadable artifact contains `report.html`, `summary.json`, `timeseries.json`, `test-window.json` and Docker evidence.');
