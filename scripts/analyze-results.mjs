import fs from 'node:fs';
import path from 'node:path';

const [root = 'artifacts', mdOut = 'artifacts/performance-diagnosis.md', jsonOut = 'artifacts/performance-diagnosis.json'] = process.argv.slice(2);
function findSummaries(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findSummaries(full);
    return entry.name === 'summary.json' ? [full] : [];
  });
}
const val = (s, metric, key, fallback = 0) => Number(s?.metrics?.[metric]?.values?.[key] ?? fallback);
function analyze(file) {
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  const sat = val(s, 'apdex_satisfied', 'count');
  const tol = val(s, 'apdex_tolerating', 'count');
  const fru = val(s, 'apdex_frustrated', 'count');
  const total = sat + tol + fru;
  const apdex = total ? (sat + tol / 2) / total : null;
  const p95 = val(s, 'http_req_duration', 'p(95)');
  const p99 = val(s, 'http_req_duration', 'p(99)');
  const waiting95 = val(s, 'http_req_waiting', 'p(95)');
  const connecting95 = val(s, 'http_req_connecting', 'p(95)');
  const tls95 = val(s, 'http_req_tls_handshaking', 'p(95)');
  const errorRate = val(s, 'http_req_failed', 'rate');
  const dropped = val(s, 'dropped_iterations', 'count');
  const minApdex = Number(s?.meta?.apdexMin ?? process.env.APDEX_MIN ?? 0.85);
  const hypotheses = [];
  const recommendations = [];
  if (errorRate > 0.01) { hypotheses.push('High failure rate: saturation, dependency errors, timeouts, or capacity protection may be active.'); recommendations.push('Correlate 5xx/timeouts with application logs, dependency metrics, pool saturation and autoscaling events.'); }
  if (p95 && waiting95 / p95 > 0.75) { hypotheses.push('Most latency is server wait/TTFB, pointing to application or downstream processing rather than client transfer.'); recommendations.push('Inspect traces, DB latency, cache hit ratio, thread/event-loop saturation and downstream calls.'); }
  if (p99 && p95 && p99 > p95 * 1.5) { hypotheses.push('Tail latency is materially worse than p95, consistent with queueing, GC pauses, lock contention or a slow dependency subset.'); recommendations.push('Segment traces by slowest 1% and compare resource saturation during those samples.'); }
  if (p95 && (connecting95 + tls95) / p95 > 0.25) { hypotheses.push('Connection/TLS overhead is a meaningful part of request latency.'); recommendations.push('Check connection reuse, DNS/network path, TLS termination and load-balancer behavior.'); }
  if (dropped > 0) { hypotheses.push('k6 dropped scheduled iterations: either the generator lacks VUs or the SUT slowed enough that arrival-rate demand could not be sustained.'); recommendations.push('First increase preAllocatedVUs/maxVUs; if drops persist, treat them as capacity evidence and inspect SUT saturation.'); }
  if (apdex !== null && apdex < minApdex) { hypotheses.push(`Apdex ${apdex.toFixed(3)} is below the configured floor ${minApdex}.`); recommendations.push('Inspect the raw satisfied/tolerating/frustrated counts; do not use Apdex alone to diagnose the subsystem.'); }
  if (!hypotheses.length) { hypotheses.push('No obvious bottleneck signature was detected in the aggregate k6 summary.'); recommendations.push('Correlate with application telemetry before concluding the system has spare capacity; aggregate summaries can hide short saturation windows.'); }
  return { file, meta: s.meta ?? {}, metrics: { p95Ms: p95, p99Ms: p99, errorRate, droppedIterations: dropped, apdex, apdexCounts: { satisfied: sat, tolerating: tol, frustrated: fru } }, hypotheses, recommendations, pass: (apdex === null || apdex >= minApdex) && dropped === 0 };
}
const results = findSummaries(root).map(analyze);
if (!results.length) { console.error(`No summary.json found under ${root}`); process.exit(2); }
const overallPass = results.every((r) => r.pass);
const lines = ['# Performance Test Diagnosis', '', `Overall: **${overallPass ? 'PASS' : 'FAIL'}**`, '', '> Diagnostic hypotheses are evidence-guided starting points, not proof of root cause. Correlate them with application metrics, logs, traces and infrastructure telemetry.', ''];
for (const r of results) {
  lines.push(`## ${r.meta.protocol ?? 'unknown'} / ${r.meta.scenario ?? 'unknown'}`, '', `- Target: ${r.meta.target ?? 'n/a'}`, `- p95: ${r.metrics.p95Ms || 'n/a'} ms`, `- p99: ${r.metrics.p99Ms || 'n/a'} ms`, `- Error rate: ${(r.metrics.errorRate * 100).toFixed(2)}%`, `- Dropped iterations: ${r.metrics.droppedIterations}`, `- Apdex: ${r.metrics.apdex === null ? 'n/a' : r.metrics.apdex.toFixed(3)} (S=${r.metrics.apdexCounts.satisfied}, T=${r.metrics.apdexCounts.tolerating}, F=${r.metrics.apdexCounts.frustrated})`, '', '### Bottleneck hypotheses');
  for (const h of r.hypotheses) lines.push(`- ${h}`);
  lines.push('', '### Recommendations'); for (const rec of r.recommendations) lines.push(`- ${rec}`); lines.push('');
}
fs.mkdirSync(path.dirname(mdOut), { recursive: true });
fs.writeFileSync(mdOut, lines.join('\n'));
fs.writeFileSync(jsonOut, JSON.stringify({ overallPass, generatedAt: new Date().toISOString(), results }, null, 2));
console.log(`Wrote ${mdOut} and ${jsonOut}`);
process.exit(overallPass ? 0 : 1);
