import fs from 'node:fs';
import path from 'node:path';
import { parseSimpleYaml } from './lib/simple-yaml.mjs';
import { parseK6JsonLines, buildK6Buckets, analyzeSignal, buildCorrelationReport, renderCorrelationMarkdown } from './lib/correlation-core.mjs';
import { loadPrometheusSignals } from './correlation/adapters/prometheus.mjs';
import { loadDatadogSignals } from './correlation/adapters/datadog.mjs';
import { loadFileSignals } from './correlation/adapters/file.mjs';
import { loadSyntheticSignals } from './correlation/adapters/synthetic.mjs';

const args = process.argv.slice(2);
const configFile = args.find((arg) => !arg.startsWith('--')) ?? process.env.TELEMETRY_CORRELATION_CONFIG ?? 'telemetry-correlation.yaml';
const rootIndex = args.indexOf('--artifacts');
const outIndex = args.indexOf('--out-dir');
const artifactsRoot = rootIndex >= 0 ? args[rootIndex + 1] : 'artifacts';
const outDir = outIndex >= 0 ? args[outIndex + 1] : path.join(artifactsRoot, 'correlation');

if (!fs.existsSync(configFile)) {
  console.error(`Telemetry correlation config not found: ${configFile}`);
  process.exit(2);
}
let config;
try { config = parseSimpleYaml(fs.readFileSync(configFile, 'utf8')); }
catch (error) {
  console.error(`Invalid telemetry correlation config: ${error.message}`);
  process.exit(2);
}

function findWindows(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findWindows(full);
    return entry.name === 'test-window.json' ? [full] : [];
  });
}

async function loadSignals(source, signals, window, analysis, k6Buckets) {
  const type = source?.type ?? 'synthetic';
  if (type === 'prometheus') return loadPrometheusSignals(source, signals, window, analysis);
  if (type === 'datadog') return loadDatadogSignals(source, signals, window, analysis);
  if (type === 'file') return loadFileSignals(source, signals, window, analysis);
  if (type === 'synthetic') return loadSyntheticSignals(source, signals, window, analysis, k6Buckets);
  throw new Error(`Unsupported telemetry correlation source.type=${type}. Use prometheus|datadog|file|synthetic.`);
}

const windows = findWindows(artifactsRoot);
if (!windows.length) {
  console.error(`No test-window.json found under ${artifactsRoot}. Run tests through scripts/run-k6-with-window.mjs.`);
  process.exit(config.required === false ? 0 : 1);
}

const reports = [];
let collectionFailed = false;
for (const windowFile of windows) {
  const runDir = path.dirname(windowFile);
  const timeseriesFile = path.join(runDir, 'timeseries.json');
  if (!fs.existsSync(timeseriesFile)) {
    console.error(`Missing granular k6 output next to ${windowFile}: ${timeseriesFile}`);
    collectionFailed = true;
    continue;
  }
  try {
    const runWindow = JSON.parse(fs.readFileSync(windowFile, 'utf8'));
    const analysis = config.analysis ?? {};
    const bucketSeconds = Number(analysis.bucketSeconds ?? 5);
    const k6Points = parseK6JsonLines(fs.readFileSync(timeseriesFile, 'utf8'));
    const k6Buckets = buildK6Buckets(k6Points, runWindow, bucketSeconds);
    const prePaddingSeconds = Number(analysis.prePaddingSeconds ?? 30);
    const postPaddingSeconds = Number(analysis.postPaddingSeconds ?? 30);
    const window = {
      ...runWindow,
      queryStart: new Date(Date.parse(runWindow.startedAt) - prePaddingSeconds * 1000).toISOString(),
      queryEnd: new Date(Date.parse(runWindow.endedAt) + postPaddingSeconds * 1000).toISOString(),
    };
    const loaded = await loadSignals(config.source ?? { type: 'synthetic' }, config.signals ?? {}, window, analysis, k6Buckets);
    const signalResults = [];
    for (const [name, spec] of Object.entries(config.signals ?? {})) {
      signalResults.push(analyzeSignal(name, spec, loaded.signals[name] ?? [], { analysis, window: runWindow, k6Buckets }));
    }
    reports.push(buildCorrelationReport({
      protocol: runWindow.protocol ?? path.basename(runDir),
      scenario: runWindow.scenario ?? 'unknown',
      target: runWindow.target ?? 'n/a',
      startedAt: runWindow.startedAt,
      endedAt: runWindow.endedAt,
      durationMs: runWindow.durationMs,
      k6Buckets: k6Buckets.length,
      artifactDir: runDir,
    }, signalResults, loaded.provenance, analysis));
  } catch (error) {
    collectionFailed = true;
    reports.push({
      schemaVersion: 1,
      run: { protocol: path.basename(runDir), artifactDir: runDir },
      source: { type: config.source?.type ?? 'unknown' },
      error: error.message,
      hypotheses: [],
      quality: { sufficientForCorrelation: false, warning: error.message },
    });
  }
}

const combined = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  config: configFile,
  required: config.required !== false,
  collectionSucceeded: !collectionFailed,
  causalityStatus: 'hypotheses_only_not_causal_proof',
  runs: reports,
  hypotheses: reports.flatMap((report) => report.hypotheses ?? []).map((hypothesis) => ({
    protocol: reports.find((report) => report.hypotheses?.includes(hypothesis))?.run?.protocol,
    ...hypothesis,
  })),
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'telemetry-correlation.json'), JSON.stringify(combined, null, 2));

const md = ['# Post-Test Telemetry Correlation', '', `Collection: **${combined.collectionSucceeded ? 'SUCCESS' : 'PARTIAL/FAILED'}**`, `Config: ${configFile}`, '', '> This report generates diagnostic hypotheses only. Correlation is not causal proof.', ''];
for (const report of reports) {
  if (report.error) {
    md.push(`## ${report.run.protocol}`, '', `- Collection error: ${report.error}`, '');
  } else {
    md.push(renderCorrelationMarkdown(report), '');
  }
}
fs.writeFileSync(path.join(outDir, 'telemetry-correlation.md'), md.join('\n'));
console.log(`Wrote ${outDir}/telemetry-correlation.md and telemetry-correlation.json`);
if (collectionFailed && config.required !== false) process.exit(1);
