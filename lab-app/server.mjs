import http from 'node:http';
import { performance } from 'node:perf_hooks';

const port = Number(process.env.PORT ?? 3000);
const baseLatency = Number(process.env.LAB_BASE_LATENCY_MS ?? 20);
const jitter = Number(process.env.LAB_JITTER_MS ?? 30);
const dependencyLatency = Number(process.env.LAB_DEPENDENCY_LATENCY_MS ?? 0);
const dbWait = Number(process.env.LAB_DB_WAIT_MS ?? 0);
const errorRate = Number(process.env.LAB_ERROR_RATE ?? 0);
const cpuBurnMs = Number(process.env.LAB_CPU_BURN_MS ?? 0);
let requests = 0;
let errors = 0;
const startedAt = Date.now();

const products = Array.from({ length: 100 }, (_, i) => ({ id: String(i + 1), name: `Product ${i + 1}`, price: Number((10 + i * 0.75).toFixed(2)) }));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function burnCpu(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) Math.sqrt(Math.random() * 1_000_000);
}
async function simulateWork() {
  const wait = baseLatency + Math.random() * jitter;
  if (wait > 0) await sleep(wait);
  if (dependencyLatency > 0) await sleep(dependencyLatency);
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

const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>k6 Benchmark Lab</title></head><body><main><h1>k6 Benchmark Lab</h1><p id="status">Loading products...</p><ul id="products"></ul></main><script>
(async()=>{const start=performance.now();const r=await fetch('/api/products?limit=12');const data=await r.json();document.querySelector('#products').innerHTML=data.items.map(p=>'<li>'+p.name+' — $'+p.price+'</li>').join('');document.querySelector('#status').textContent='Loaded '+data.items.length+' products in '+Math.round(performance.now()-start)+' ms';})();
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  requests += 1;
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname === '/health') return json(res, 200, { status: 'ok' });
  if (url.pathname === '/__config') return json(res, 200, { baseLatency, jitter, dependencyLatency, dbWait, errorRate, cpuBurnMs, pid: process.pid });
  if (url.pathname === '/metrics') {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
    return res.end(`lab_requests_total ${requests}\nlab_errors_total ${errors}\nprocess_resident_memory_bytes ${mem.rss}\nprocess_cpu_user_seconds_total ${cpu.user / 1_000_000}\nprocess_cpu_system_seconds_total ${cpu.system / 1_000_000}\nprocess_uptime_seconds ${(Date.now()-startedAt)/1000}\n`);
  }
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

server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ event: 'lab_started', port, baseLatency, jitter, dependencyLatency, dbWait, errorRate, cpuBurnMs })));
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
