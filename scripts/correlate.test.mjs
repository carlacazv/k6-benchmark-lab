import { analyzeSignal, bestLagCorrelation, buildCorrelationReport, pearson } from './lib/correlation-core.mjs';
import { parsePrometheusMatrix } from './telemetry/adapters/prometheus.mjs';
import { parseDatadogSeries } from './telemetry/adapters/datadog.mjs';

const startMs = Date.parse('2026-08-18T12:00:00Z');
const bucketSeconds = 5;
const k6Buckets = Array.from({ length: 30 }, (_, i) => ({
  timestamp: new Date(startMs + i * bucketSeconds * 1000).toISOString(),
  timestampMs: startMs + i * bucketSeconds * 1000,
  latencyAvgMs: 100 + i * 12,
  errorRate: i > 24 ? (i - 24) * 0.02 : 0,
  iterationRate: 5 + i,
}));
const window = {
  startedAt: new Date(startMs).toISOString(),
  endedAt: new Date(startMs + 29 * bucketSeconds * 1000).toISOString(),
};
const analysis = {
  bucketSeconds,
  minimumMatchedBuckets: 6,
  strongCorrelation: 0.65,
  maxLagBuckets: 3,
  prePaddingSeconds: 30,
  postPaddingSeconds: 30,
  memoryGrowthFraction: 0.1,
  saturationFraction: 0.2,
};

function extendedSamples(role) {
  const samples = [];
  for (let i = -6; i <= 35; i += 1) {
    const ts = startMs + i * bucketSeconds * 1000;
    const during = i >= 0 && i < 30;
    let value = 0;
    if (role === 'cpu_utilization') value = during ? 0.25 + i * 0.026 : i >= 30 ? 0.3 : 0.22;
    if (role === 'memory_utilization') value = during ? 0.4 + i * 0.012 : i >= 30 ? 0.77 : 0.4;
    if (role === 'db_pool_utilization') value = during ? 0.2 + i * 0.028 : 0.2;
    if (role === 'dependency_latency_ms') value = during ? 30 + i * 9 : 30;
    if (role === 'replicas') value = during && i >= 18 ? 2 : 1;
    samples.push({ timestamp: new Date(ts).toISOString(), value });
  }
  return samples;
}

const cpu = analyzeSignal('cpu', { role: 'cpu_utilization', unit: 'ratio', threshold: 0.85 }, extendedSamples('cpu_utilization'), { analysis, window, k6Buckets });
if (cpu.correlations.latency.r < 0.95) throw new Error(`Expected strong CPU/latency correlation, got ${cpu.correlations.latency.r}`);
if (!cpu.hypotheses.some((h) => h.statement.includes('CPU saturation'))) throw new Error('Expected CPU saturation hypothesis');

const memory = analyzeSignal('memory', { role: 'memory_utilization', unit: 'ratio', threshold: 0.9 }, extendedSamples('memory_utilization'), { analysis, window, k6Buckets });
if (!memory.hypotheses.some((h) => h.statement.includes('retention/leak'))) throw new Error('Expected memory retention/leak hypothesis');

const replicas = analyzeSignal('replicas', { role: 'replicas', unit: 'count' }, extendedSamples('replicas'), { analysis, window, k6Buckets });
if (!replicas.hypotheses.some((h) => h.statement.includes('Autoscaling reacted'))) throw new Error('Expected autoscaling hypothesis');

const irregularValues = [3, 11, 4, 19, 7, 2, 17, 5, 23, 9, 1, 14, 6, 21, 8, 16, 10, 24, 12, 18, 13, 25, 15, 22, 20, 27, 26, 30, 28, 29];
const lagBuckets = k6Buckets.map((bucket, i) => ({ ...bucket, latencyAvgMs: irregularValues[i] }));
const delayed = lagBuckets.map((bucket, i) => ({ timestamp: new Date(bucket.timestampMs + 2 * bucketSeconds * 1000).toISOString(), timestampMs: bucket.timestampMs + 2 * bucketSeconds * 1000, value: irregularValues[i] }));
const lag = bestLagCorrelation(lagBuckets, delayed, 'latencyAvgMs', 3, 6, bucketSeconds);
if (lag.lagBuckets !== 2 || lag.r < 0.99) throw new Error(`Expected +2 lag correlation, got ${JSON.stringify(lag)}`);

const p = parsePrometheusMatrix({ status: 'success', data: { resultType: 'matrix', result: [
  { values: [[1, '2'], [2, '4']] }, { values: [[1, '4'], [2, '8']] },
] } }, 'avg');
if (p[0].value !== 3 || p[1].value !== 6) throw new Error(`Prometheus avg aggregation failed: ${JSON.stringify(p)}`);

const d = parseDatadogSeries({ status: 'ok', series: [
  { pointlist: [[1000, 2], [2000, 4]] }, { pointlist: [[1000, 6], [2000, 8]] },
] }, 'avg');
if (d[0].value !== 4 || d[1].value !== 6) throw new Error(`Datadog avg aggregation failed: ${JSON.stringify(d)}`);

if (Math.abs(pearson([1,2,3], [2,4,6]) - 1) > 1e-9) throw new Error('Pearson implementation failed');

const report = buildCorrelationReport({ protocol: 'rest', scenario: 'load', startedAt: window.startedAt, endedAt: window.endedAt, k6Buckets: k6Buckets.length }, [cpu, memory, replicas], { type: 'fixture', synthetic: false }, analysis);
if (!report.quality.sufficientForCorrelation || report.hypotheses.length < 3) throw new Error('Correlation report did not retain evidence');

const shortWindow = {
  startedAt: '2026-08-18T12:00:00.200Z',
  endedAt: '2026-08-18T12:00:00.700Z',
};
const shortBuckets = [{
  timestamp: '2026-08-18T12:00:00.000Z',
  timestampMs: Date.parse('2026-08-18T12:00:00.000Z'),
  latencyAvgMs: 450,
  errorRate: 0,
  iterationRate: 1,
}];
const shortCpu = analyzeSignal('cpu', { role: 'cpu_utilization', unit: 'ratio', threshold: 0.85 }, [
  { timestamp: '2026-08-18T11:59:59.000Z', value: 0.2 },
  { timestamp: '2026-08-18T12:00:00.000Z', value: 0.95 },
  { timestamp: '2026-08-18T12:00:01.000Z', value: 0.3 },
], { analysis: { ...analysis, bucketSeconds: 1 }, window: shortWindow, k6Buckets: shortBuckets });
if (shortCpu.segments.during.mean !== 0.95) throw new Error(`Sub-bucket test window lost during telemetry: ${JSON.stringify(shortCpu.segments)}`);
if (shortCpu.hypotheses.length !== 0 || shortCpu.inferenceEligible !== false) throw new Error('Short smoke should suppress RCA hypotheses when matched-bucket minimum is not met');

const shortReport = buildCorrelationReport({ protocol: 'rest', scenario: 'smoke', startedAt: shortWindow.startedAt, endedAt: shortWindow.endedAt, k6Buckets: 1 }, [shortCpu], { type: 'fixture', synthetic: true }, { ...analysis, bucketSeconds: 1 });
if (shortReport.quality.sufficientForCorrelation || shortReport.hypotheses.length) throw new Error('Short report must remain evidence-only without RCA hypotheses');

const syntheticLongReport = buildCorrelationReport({ protocol: 'browser', scenario: 'smoke', startedAt: window.startedAt, endedAt: window.endedAt, k6Buckets: k6Buckets.length }, [cpu, memory, replicas], { type: 'synthetic', synthetic: true }, analysis);
if (!syntheticLongReport.quality.sufficientForCorrelation || syntheticLongReport.quality.inferenceAllowed !== false) throw new Error('Synthetic source should retain statistical sufficiency but disable operational inference');
if (syntheticLongReport.hypotheses.length || syntheticLongReport.signals.some((signal) => signal.hypotheses.length)) throw new Error('Synthetic telemetry must suppress operational RCA hypotheses');

console.log('correlation tests passed');
