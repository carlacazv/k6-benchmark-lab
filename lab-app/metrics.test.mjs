import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 3301;
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['lab-app/server.mjs'], {
  env: {
    ...process.env,
    PORT: String(port),
    LAB_BASE_LATENCY_MS: '0',
    LAB_JITTER_MS: '0',
    LAB_DEPENDENCY_LATENCY_MS: '120',
    LAB_DEPENDENCY_LATENCY_START_AFTER_MS: '0',
    LAB_DEPENDENCY_LATENCY_DURATION_MS: '1500',
    LAB_DB_WAIT_MS: '0',
    LAB_CPU_BURN_MS: '0',
    LAB_ERROR_RATE: '0',
  },
  stdio: 'ignore',
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHealth() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch {}
    await sleep(50);
  }
  throw new Error('lab did not become healthy');
}

try {
  await waitForHealth();
  const pre = await (await fetch(`${baseUrl}/metrics`)).text();
  assert.match(pre, /lab_dependency_latency_milliseconds 0\n/);
  assert.match(pre, /lab_event_loop_utilization_ratio /);
  assert.match(pre, /process_cpu_user_seconds_total /);

  const response = await fetch(`${baseUrl}/api/products?limit=1`);
  assert.equal(response.status, 200);
  const during = await (await fetch(`${baseUrl}/metrics`)).text();
  assert.match(during, /lab_dependency_latency_milliseconds 120\n/);
  assert.match(during, /lab_business_requests_total 1\n/);

  await sleep(1500);
  const post = await (await fetch(`${baseUrl}/metrics`)).text();
  assert.match(post, /lab_dependency_latency_milliseconds 0\n/);
  console.log('lab metrics tests passed');
} finally {
  child.kill('SIGTERM');
}
