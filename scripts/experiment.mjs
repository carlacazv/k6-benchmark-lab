import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseSimpleYaml } from './lib/simple-yaml.mjs';
import { classifyExperiment, metricFromSummary, validateExperimentPlan } from './lib/experiment-core.mjs';

const args = process.argv.slice(2);
const configPath = args[0] || process.env.EXPERIMENT_CONFIG || 'experiments/dependency-latency.yaml';
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex >= 0 ? args[outIndex + 1] : 'artifacts/experiments/dependency-latency';
const requireSupported = args.includes('--require-supported');
const port = Number(process.env.EXPERIMENT_PORT || 3101);
const k6Bin = process.env.K6_BIN || 'k6';
const serverScript = process.env.LAB_SERVER_SCRIPT || 'lab-app/server.mjs';
const targetBaseUrl = `http://127.0.0.1:${port}`;

const allowedEnvironmentKeys = new Set([
  'LAB_BASE_LATENCY_MS',
  'LAB_JITTER_MS',
  'LAB_DEPENDENCY_LATENCY_MS',
  'LAB_DB_WAIT_MS',
  'LAB_CPU_BURN_MS',
  'LAB_ERROR_RATE',
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { stdio: options.stdio || 'inherit', env: options.env || process.env });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

async function waitForHealth(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Lab target did not become healthy: ${lastError?.message || 'timeout'}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(1500).then(() => { if (child.exitCode === null) child.kill('SIGKILL'); }),
  ]);
}

function sanitizedEnvironment(experiment) {
  const configured = experiment.environment || {};
  const result = {};
  for (const [key, value] of Object.entries(configured)) {
    if (!allowedEnvironmentKeys.has(key)) throw new Error(`Unsupported experiment environment key: ${key}`);
    result[key] = String(value);
  }
  return result;
}

async function executeRole({ experiment, role, value, trial, trialDir }) {
  const env = {
    ...process.env,
    PORT: String(port),
    ...sanitizedEnvironment(experiment),
    [experiment.intervention.variable]: String(value),
  };
  fs.mkdirSync(trialDir, { recursive: true });
  const stdoutPath = path.join(trialDir, `${role}-lab.log`);
  const logFd = fs.openSync(stdoutPath, 'w');
  const child = spawn(process.execPath, [serverScript], { env, stdio: ['ignore', logFd, logFd] });
  let config;
  const startedAt = new Date().toISOString();
  try {
    await waitForHealth(targetBaseUrl);
    const configResponse = await fetch(`${targetBaseUrl}/__config`);
    config = await configResponse.json();
    const reportDir = path.join(trialDir, role);
    fs.mkdirSync(reportDir, { recursive: true });
    const k6Result = await run(k6Bin, ['run', 'tests/experiment/rest.js'], {
      env: {
        ...process.env,
        TARGET_BASE_URL: targetBaseUrl,
        K6_REPORT_DIR: reportDir,
        EXPERIMENT_VUS: String(experiment.workload.vus),
        EXPERIMENT_ITERATIONS: String(experiment.workload.iterations),
        EXPERIMENT_MAX_DURATION_SECONDS: String(experiment.safety?.maxDurationSeconds ?? 30),
        EXPERIMENT_ROLE: role,
        EXPERIMENT_TRIAL: String(trial),
      },
    });
    if (k6Result.code !== 0) throw new Error(`k6 exited with code ${k6Result.code}`);
    const summary = JSON.parse(fs.readFileSync(path.join(reportDir, 'summary.json'), 'utf8'));
    return {
      role,
      interventionValue: Number(value),
      config,
      startedAt,
      endedAt: new Date().toISOString(),
      summaryPath: path.join(reportDir, 'summary.json'),
      metric: metricFromSummary(summary, experiment.expected.metric),
      requestCount: Number(summary.metrics?.http_reqs?.values?.count ?? 0),
      failureRate: Number(summary.metrics?.http_req_failed?.values?.rate ?? 0),
      p95Ms: Number(summary.metrics?.http_req_duration?.values?.['p(95)'] ?? NaN),
      throughputRps: Number(summary.metrics?.http_reqs?.values?.rate ?? NaN),
    };
  } finally {
    await stopProcess(child);
    fs.closeSync(logFd);
    await sleep(150);
  }
}

function markdown(report) {
  const e = report.experiment;
  const lines = [
    `# Controlled Performance Experiment: ${e.id}`,
    '',
    `- Status: **${report.result.status}**`,
    `- Hypothesis: ${e.hypothesis}`,
    `- Intervention: \`${e.intervention.variable}\` ${e.intervention.control} → ${e.intervention.treatment}`,
    `- Expected: ${e.expected.metric} ${e.expected.direction} by at least ${e.expected.minimumRelativeChange * 100}% and ${e.expected.minimumAbsoluteChange} absolute units`,
    `- Trials: ${e.trials}`,
    `- Consistency: ${(report.result.consistency * 100).toFixed(1)}%`,
    `- Median control: ${Number(report.result.medianControl).toFixed(3)}`,
    `- Median treatment: ${Number(report.result.medianTreatment).toFixed(3)}`,
    '',
    '## Trial evidence',
    '',
    '| Trial | Order | Control | Treatment | Relative delta | Verdict |',
    '|---:|---|---:|---:|---:|---|',
  ];
  for (const trial of report.result.trials) {
    const pct = Number.isFinite(trial.evaluation.relative) ? `${(trial.evaluation.relative * 100).toFixed(1)}%` : 'n/a';
    lines.push(`| ${trial.trial} | ${trial.order} | ${trial.control.toFixed(3)} | ${trial.treatment.toFixed(3)} | ${pct} | ${trial.evaluation.verdict} |`);
  }
  lines.push('', '## Interpretation', '', report.result.caveat, '', 'A result of **SUPPORTED** means the intervention produced the expected directional effect repeatedly under this controlled lab workload. It does **not** mean the same variable is automatically the production root cause.', '');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const plan = parseSimpleYaml(fs.readFileSync(configPath, 'utf8'));
  const validation = validateExperimentPlan(plan);
  if (!validation.valid) throw new Error(`Invalid experiment plan:\n- ${validation.errors.join('\n- ')}`);
  const experiment = plan.experiment;
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(configPath, path.join(outDir, 'experiment-plan.yaml'));

  const trials = [];
  for (let trial = 1; trial <= Number(experiment.trials); trial += 1) {
    const controlFirst = trial % 2 === 1;
    const order = controlFirst ? ['control', 'treatment'] : ['treatment', 'control'];
    const evidence = {};
    for (const role of order) {
      const value = role === 'control' ? experiment.intervention.control : experiment.intervention.treatment;
      evidence[role] = await executeRole({ experiment, role, value, trial, trialDir: path.join(outDir, `trial-${trial}`) });
    }
    trials.push({
      trial,
      order: order.join('→'),
      control: evidence.control.metric,
      treatment: evidence.treatment.metric,
      evidence,
    });
  }

  const result = classifyExperiment({ trials, expected: experiment.expected });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    experiment,
    target: targetBaseUrl,
    changedVariables: [experiment.intervention.variable],
    methodology: {
      design: 'paired repeated control/treatment experiment',
      order: 'alternating AB/BA to reduce monotonic time-order bias',
      sameWorkload: true,
      causalClaim: 'hypothesis evidence only; production causality is not proven',
    },
    result,
  };
  fs.writeFileSync(path.join(outDir, 'experiment-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'experiment-report.md'), markdown(report));
  console.log(`[experiment] ${experiment.id}: ${result.status} (${(result.consistency * 100).toFixed(1)}% consistency)`);
  if (requireSupported && result.status !== 'SUPPORTED') process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
