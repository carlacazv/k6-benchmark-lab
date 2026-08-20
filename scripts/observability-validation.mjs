import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const configPath = args[0] || process.env.OBSERVABILITY_CORRELATION_CONFIG || 'observability-correlation.yaml';
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex >= 0 ? args[outIndex + 1] : 'artifacts/observability';
const prometheusConfig = path.resolve(process.env.PROMETHEUS_CONFIG || 'observability/prometheus.yml');
const prometheusImage = process.env.PROMETHEUS_IMAGE || 'prom/prometheus:v3.5.0';
const containerName = process.env.PROMETHEUS_CONTAINER || 'k6-benchmark-lab-prometheus';
const labPort = 3201;
const prometheusPort = 9090;
const targetBaseUrl = `http://127.0.0.1:${labPort}`;
const prometheusBaseUrl = `http://127.0.0.1:${prometheusPort}`;
const k6Dir = path.join(outDir, 'k6');
const correlationDir = path.join(outDir, 'correlation');
const labLogPath = path.join(outDir, 'lab.log');
const prometheusLogPath = path.join(outDir, 'prometheus.log');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      stdio: options.stdio || 'inherit',
      env: options.env || process.env,
      cwd: options.cwd || process.cwd(),
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

async function waitFor(url, predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok && await predicate(response)) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'condition not met'}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(1500).then(() => { if (child.exitCode === null) child.kill('SIGKILL'); }),
  ]);
}

function writeValidation(report) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'observability-validation.json'), `${JSON.stringify(report, null, 2)}\n`);
  const lines = [
    '# Real Prometheus Observability Validation',
    '',
    `- Status: **${report.status}**`,
    `- Telemetry source: **${report.source ?? 'n/a'}**`,
    `- Operational inference allowed: **${report.inferenceAllowed ? 'yes' : 'no'}**`,
    `- k6 buckets: ${report.k6Buckets ?? 'n/a'}`,
    `- Dependency latency vs request latency: r=${report.dependencyLatencyCorrelation?.r ?? 'n/a'}, lag=${report.dependencyLatencyCorrelation?.lagBuckets ?? 'n/a'}, matched=${report.dependencyLatencyCorrelation?.matchedBuckets ?? 'n/a'}`,
    `- Matching dependency hypothesis: **${report.matchingHypothesis ? 'yes' : 'no'}**`,
    '',
    '## Controlled temporal profile',
    '',
    '- baseline: first 6 seconds',
    '- treatment: 120 ms downstream latency for 10 seconds',
    '- recovery: remainder of the 24-second k6 run',
    '',
    '> This proves the observability and hypothesis-generation path against real scraped telemetry in the owned lab. It does not prove production causality.',
    '',
  ];
  if (report.error) lines.push('## Error', '', report.error, '');
  fs.writeFileSync(path.join(outDir, 'observability-validation.md'), `${lines.join('\n')}\n`);
}

async function main() {
  fs.mkdirSync(k6Dir, { recursive: true });
  fs.mkdirSync(correlationDir, { recursive: true });
  if (!fs.existsSync(prometheusConfig)) throw new Error(`Prometheus config not found: ${prometheusConfig}`);

  spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
  const labLog = fs.openSync(labLogPath, 'w');
  const lab = spawn(process.execPath, ['lab-app/server.mjs'], {
    env: {
      ...process.env,
      PORT: String(labPort),
      LAB_BASE_LATENCY_MS: '15',
      LAB_JITTER_MS: '0',
      LAB_DEPENDENCY_LATENCY_MS: '120',
      LAB_DEPENDENCY_LATENCY_START_AFTER_MS: '6000',
      LAB_DEPENDENCY_LATENCY_DURATION_MS: '10000',
      LAB_DB_WAIT_MS: '0',
      LAB_CPU_BURN_MS: '0',
      LAB_ERROR_RATE: '0',
    },
    stdio: ['ignore', labLog, labLog],
  });

  try {
    await waitFor(`${targetBaseUrl}/health`, async () => true, 7000);
    const before = await (await fetch(`${targetBaseUrl}/__config`)).json();
    fs.writeFileSync(path.join(outDir, 'lab-config-before.json'), `${JSON.stringify(before, null, 2)}\n`);

    const dockerResult = await run('docker', [
      'run', '-d', '--name', containerName,
      '--add-host', 'host.docker.internal:host-gateway',
      '-p', `127.0.0.1:${prometheusPort}:9090`,
      '-v', `${prometheusConfig}:/etc/prometheus/prometheus.yml:ro`,
      prometheusImage,
      '--config.file=/etc/prometheus/prometheus.yml',
      '--storage.tsdb.path=/prometheus',
      '--storage.tsdb.retention.time=1h',
    ]);
    if (dockerResult.code !== 0) throw new Error(`Prometheus container failed to start with exit code ${dockerResult.code}.`);

    await waitFor(`${prometheusBaseUrl}/-/ready`, async () => true, 15000);
    const query = encodeURIComponent('lab_dependency_latency_milliseconds');
    await waitFor(`${prometheusBaseUrl}/api/v1/query?query=${query}`, async (response) => {
      const payload = await response.json();
      return payload?.status === 'success' && (payload?.data?.result?.length ?? 0) > 0;
    }, 15000);
    await sleep(2200);

    const k6Result = await run(process.execPath, [
      'scripts/run-k6-with-window.mjs',
      'tests/observability/rest.js',
      k6Dir,
      'observability',
    ], {
      env: {
        ...process.env,
        TARGET_BASE_URL: targetBaseUrl,
        SCENARIO: 'real-prometheus',
        OBSERVABILITY_DURATION_SECONDS: '24',
        OBSERVABILITY_VUS: '4',
      },
    });
    if (k6Result.code !== 0) throw new Error(`Observability k6 run failed with exit code ${k6Result.code}.`);

    await sleep(3200);
    const after = await (await fetch(`${targetBaseUrl}/__config`)).json();
    fs.writeFileSync(path.join(outDir, 'lab-config-after.json'), `${JSON.stringify(after, null, 2)}\n`);

    const correlationResult = await run(process.execPath, [
      'scripts/correlate.mjs', configPath,
      '--artifacts', k6Dir,
      '--out-dir', correlationDir,
    ]);
    if (correlationResult.code !== 0) throw new Error(`Real Prometheus correlation failed with exit code ${correlationResult.code}.`);

    const combined = JSON.parse(fs.readFileSync(path.join(correlationDir, 'telemetry-correlation.json'), 'utf8'));
    const runReport = (combined.runs ?? []).find((run) => run?.run?.protocol === 'observability') ?? combined.runs?.[0];
    const dependency = runReport?.signals?.find((signal) => signal.signal === 'dependencyLatency');
    const matchingHypothesis = (runReport?.hypotheses ?? []).find((hypothesis) => hypothesis.role === 'dependency_latency_ms');
    const correlation = dependency?.correlations?.latency ?? null;
    const strong = Number(runReport?.analysis?.strongCorrelation ?? 0.8);
    const pass = combined.collectionSucceeded === true
      && runReport?.source?.type === 'prometheus'
      && runReport?.source?.synthetic !== true
      && runReport?.quality?.inferenceAllowed === true
      && Number(correlation?.r) >= strong
      && Boolean(matchingHypothesis);

    const validation = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      status: pass ? 'PASS' : 'FAIL',
      source: runReport?.source?.type ?? null,
      synthetic: runReport?.source?.synthetic ?? null,
      inferenceAllowed: runReport?.quality?.inferenceAllowed ?? false,
      k6Buckets: runReport?.quality?.k6Buckets ?? null,
      dependencyLatencyCorrelation: correlation,
      matchingHypothesis: matchingHypothesis ?? null,
      strongestLatencyCorrelations: runReport?.strongestLatencyCorrelations ?? [],
      causalityStatus: runReport?.causalityStatus ?? combined.causalityStatus,
    };
    writeValidation(validation);
    console.log(`[real-observability] ${validation.status}: dependency latency r=${correlation?.r ?? 'n/a'}`);
    if (!pass) process.exitCode = 2;
  } finally {
    const logs = spawnSync('docker', ['logs', containerName], { encoding: 'utf8' });
    fs.writeFileSync(prometheusLogPath, `${logs.stdout || ''}${logs.stderr || ''}`);
    spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
    await stopProcess(lab);
    fs.closeSync(labLog);
  }
}

main().catch((error) => {
  writeValidation({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'FAIL',
    source: 'prometheus',
    inferenceAllowed: false,
    matchingHypothesis: null,
    error: error.stack || error.message || String(error),
  });
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
