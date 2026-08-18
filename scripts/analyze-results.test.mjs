import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function runCase(summary, expectedStatus, expectedPass) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k6-lab-'));
  const sampleDir = path.join(dir, 'rest');
  fs.mkdirSync(sampleDir);
  fs.writeFileSync(path.join(sampleDir, 'summary.json'), JSON.stringify(summary));
  const md = path.join(dir, 'report.md');
  const js = path.join(dir, 'report.json');
  const run = spawnSync(process.execPath, ['scripts/analyze-results.mjs', dir, md, js], { encoding: 'utf8' });
  if (run.status !== expectedStatus) throw new Error(`Unexpected exit ${run.status}: ${run.stderr || run.stdout}`);
  const out = JSON.parse(fs.readFileSync(js, 'utf8'));
  if (out.overallPass !== expectedPass) throw new Error('Unexpected analyzer pass state');
  return out;
}

const base = {
  meta: { protocol: 'rest', scenario: 'smoke', apdexMin: 0.85 },
  metrics: {
    apdex_satisfied: { values: { count: 9 } },
    apdex_tolerating: { values: { count: 1 } },
    apdex_frustrated: { values: { count: 0 } },
    dropped_iterations: { values: { count: 0 }, thresholds: { 'count==0': { ok: true } } },
    http_req_failed: { values: { rate: 0 }, thresholds: { 'rate<0.01': { ok: true } } },
    http_req_duration: { values: { 'p(95)': 120, 'p(99)': 150 }, thresholds: { 'p(95)<500': { ok: true }, 'p(99)<1000': { ok: true } } },
    http_req_waiting: { values: { 'p(95)': 100 } },
    http_reqs: { values: { count: 100, rate: 10 } },
    iterations: { values: { count: 100, rate: 10 } },
  },
};

const passed = runCase(base, 0, true);
if (Math.abs(passed.results[0].metrics.apdex - 0.95) > 1e-9) throw new Error('Unexpected Apdex');
if (passed.results[0].metrics.p99Ms !== 150 || passed.results[0].metrics.requestRate !== 10) throw new Error('Expected p99/throughput evidence');
if (passed.results[0].metrics.apdexGate.eligible !== false) throw new Error('10 Apdex observations should remain informational with the default 20-sample gate');

const failedThreshold = structuredClone(base);
failedThreshold.metrics.http_req_duration.thresholds['p(95)<100'] = { ok: false };
runCase(failedThreshold, 1, false);

const smallLowApdex = structuredClone(base);
smallLowApdex.metrics.apdex_satisfied.values.count = 1;
smallLowApdex.metrics.apdex_tolerating.values.count = 1;
const small = runCase(smallLowApdex, 0, true);
if (Math.abs(small.results[0].metrics.apdex - 0.75) > 1e-9) throw new Error('Expected small-sample Apdex 0.75');
if (small.results[0].metrics.apdexGate.eligible !== false || small.results[0].metrics.apdexGate.pass !== true) throw new Error('Small Apdex sample should be informational, not a release gate');

const largeLowApdex = structuredClone(base);
largeLowApdex.meta.apdexMinSamples = 20;
largeLowApdex.metrics.apdex_satisfied.values.count = 10;
largeLowApdex.metrics.apdex_tolerating.values.count = 10;
const large = runCase(largeLowApdex, 1, false);
if (large.results[0].metrics.apdexGate.eligible !== true || large.results[0].metrics.apdexGate.pass !== false) throw new Error('Low Apdex with enough observations must fail the gate');

console.log('analyzer tests passed');
