import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { scheduledInterventionValue } from './schedule.mjs';

const port = Number(process.env.PORT ?? 3000);
const baseLatency = Number(process.env.LAB_BASE_LATENCY_MS ?? 20);
const jitter = Number(process.env.LAB_JITTER_MS ?? 30);
const dependencyLatency = Number(process.env.LAB_DEPENDENCY_LATENCY_MS ?? 0);
const dependencyLatencyStartAfterMs = Number(process.env.LAB_DEPENDENCY_LATENCY_START_AFTER_MS ?? 0);
const dependencyLatencyDurationMs = Number(process.env.LAB_DEPENDENCY_LATENCY_DURATION_MS ?? 0);
const dbWait = Number(process.env.LAB_DB_WAIT_MS ?? 0);
const errorRate = Number(process.env.LAB_ERROR_RATE ?? 0);
const cpuBurnMs = Number(process.env.LAB_CPU_BURN_MS ?? 0);
let requests = 0;
let businessRequests = 0;
let errors = 0;
let activeRequests = 0;
let requestDurationMsSum = 0;
let requestDurationCount = 0;
let workloadStartedAt = null;
const startedAt = Date.now();

const products = Array.from({ length: 100 }, (_, i) => ({ id: String(i + 1), name: `Product ${i + 1}`, price: Number((10 + i * 0.75).toFixed(2)) }));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function burnCpu(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) Math.sqrt(Math.random() * 1_000_000);
}
function currentDependencyLatency(nowMs = Date.now()) {
  return scheduledInterventionValue({
    configuredValue: dependencyLatency,
    startAfterMs: dependencyLatencyStartAfterMs,
    durationMs: dependencyLatencyDurationMs,
    workloadStartedAt,
    nowMs,
  });
}
async function simulateWork() {
  const wait = baseLatency + Math.random() * jitter;
  if (wait > 0) await sleep(wait);
  const downstreamWait = currentDependencyLatency();
  if (downstreamWait > 0) await sleep(downstreamWait);
  if (dbWait > 0) await sleep(dbWait);
  if (cpuBurnMs > 0) burnCpu(cpuBurnMs);
}
function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'cache-control': 'no-store' });
  res.end(payload);
}
function html(res, body) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
function prometheusMetrics() {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const elu = performance.eventLoopUtilization();
  const dependencyNow = currentDependencyLatency();
  return [
    '# TYPE lab_requests_total counter',
    `lab_requests_total ${requests}`,
    '# TYPE lab_business_requests_total counter',
    `lab_business_requests_total ${businessRequests}`,
    '# TYPE lab_errors_total counter',
    `lab_errors_total ${errors}`,
    '# TYPE lab_active_requests gauge',
    `lab_active_requests ${activeRequests}`,
    '# TYPE lab_dependency_latency_milliseconds gauge',
    `lab_dependency_latency_milliseconds ${dependencyNow}`,
    '# TYPE lab_db_wait_milliseconds gauge',
    `lab_db_wait_milliseconds ${dbWait}`,
    '# TYPE lab_event_loop_utilization_ratio gauge',
    `lab_event_loop_utilization_ratio ${elu.utilization}`,
    '# TYPE lab_request_duration_milliseconds summary',
    `lab_request_duration_milliseconds_sum ${requestDurationMsSum}`,
    `lab_request_duration_milliseconds_count ${requestDurationCount}`,
    '# TYPE process_resident_memory_bytes gauge',
    `process_resident_memory_bytes ${mem.rss}`,
    '# TYPE process_cpu_user_seconds_total counter',
    `process_cpu_user_seconds_total ${cpu.user / 1_000_000}`,
    '# TYPE process_cpu_system_seconds_total counter',
    `process_cpu_system_seconds_total ${cpu.system / 1_000_000}`,
    '# TYPE process_uptime_seconds gauge',
    `process_uptime_seconds ${(Date.now() - startedAt) / 1000}`,
    '# TYPE lab_workload_started gauge',
    `lab_workload_started ${workloadStartedAt === null ? 0 : 1}`,
    '',
  ].join('\n');
}

const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>k6 Benchmark Lab</title></head><body><main><h1>k6 Benchmark Lab</h1><p id="status">Loading products...</p><ul id="products"></ul></main><script>
(async()=>{const start=performance.now();const r=await fetch('/api/products?limit=12');const data=await r.json();document.querySelector('#products').innerHTML=data.items.map(p=>'<li>'+p.name+' — $'+p.price+'</li>').join('');document.querySelector('#status').textContent='Loaded '+data.items.length+' products in '+Math.round(performance.now()-start)+' ms';})();
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  requests += 1;
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (url.pathname === '/__config') return json(res, 200, {
    baseLatency,
    jitter,
    dependencyLatency,
    dependencyLatencyStartAfterMs,
    dependencyLatencyDurationMs,
    currentDependencyLatency: currentDependencyLatency(),
    dbWait,
    errorRate,
    cpuBurnMs,
    workloadStartedAt: workloadStartedAt === null ? null : new Date(workloadStartedAt).toISOString(),
    pid: process.pid,
  });
  if (url.pathname === '/metrics') {
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
    return res.end(prometheusMetrics());
  }

  if (workloadStartedAt === null) workloadStartedAt = Date.now();
  businessRequests += 1;
  activeRequests += 1;
  const requestStarted = performance.now();
  res.once('finish', () => {
    activeRequests = Math.max(0, activeRequests - 1);
    requestDurationMsSum += performance.now() - requestStarted;
    requestDurationCount += 1;
  });

  await simulateWork();
  if (Math.random() < errorRate) { errors += 1; return json(res, 503, { error: 'controlled synthetic failure' }); }
  if (req.method === 'GET' && url.pathname === '/api/products') {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
    return json(res, 200, { items: products.slice(0, limit), total: products.length });
  }
  if (req.method === 'POST' && url.pathname === '/graphql') {
    try {
      const body = JSON.parse(await readBody(req));
      const limit = Math.min(100, Math.max(1, Number(body?.variables?.limit ?? 20)));
      if (!String(body?.query ?? '').includes('products')) return json(res, 200, { errors: [{ message: 'Unknown field' }] });
      return json(res, 200, { data: { products: products.slice(0, limit) } });
    } catch { errors += 1; return json(res, 400, { errors: [{ message: 'Invalid request' }] }); }
  }
  if (req.method === 'GET' && url.pathname === '/') return html(res, page);
  return json(res, 404, { error: 'not found' });
});

server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({
  event: 'lab_started',
  port,
  baseLatency,
  jitter,
  dependencyLatency,
  dependencyLatencyStartAfterMs,
  dependencyLatencyDurationMs,
  dbWait,
  errorRate,
  cpuBurnMs,
})));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
