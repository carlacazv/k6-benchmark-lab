const round = (value, digits = 3) => value === null || value === undefined || !Number.isFinite(Number(value))
  ? null
  : Number(Number(value).toFixed(digits));

export function percentile(values, p) {
  const clean = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const rank = (Number(p) / 100) * (clean.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return clean[low];
  const weight = rank - low;
  return clean[low] * (1 - weight) + clean[high] * weight;
}

function mean(values) {
  const clean = values.map(Number).filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

export function pearson(xs, ys) {
  const pairs = xs.map((x, index) => [Number(x), Number(ys[index])])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  const mx = mean(pairs.map(([x]) => x));
  const my = mean(pairs.map(([, y]) => y));
  let numerator = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (const [x, y] of pairs) {
    const dx = x - mx;
    const dy = y - my;
    numerator += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denominator = Math.sqrt(dx2 * dy2);
  return denominator ? numerator / denominator : null;
}

function bucketTimestamp(timestampMs, bucketMs) {
  return Math.floor(timestampMs / bucketMs) * bucketMs;
}

export function parseK6JsonLines(text) {
  const points = [];
  for (const [index, raw] of String(text).split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    let item;
    try { item = JSON.parse(line); }
    catch { throw new Error(`Invalid k6 JSON line ${index + 1}.`); }
    if (item.type !== 'Point') continue;
    const timestampMs = Date.parse(item.data?.time);
    const value = Number(item.data?.value);
    if (!Number.isFinite(timestampMs) || !Number.isFinite(value)) continue;
    points.push({
      metric: item.metric,
      timestamp: new Date(timestampMs).toISOString(),
      timestampMs,
      value,
      tags: item.data?.tags ?? {},
    });
  }
  return points;
}

function emptyBucket(timestampMs) {
  return {
    timestamp: new Date(timestampMs).toISOString(),
    timestampMs,
    latencyValues: [],
    failedValues: [],
    httpReqValues: [],
    iterationValues: [],
    droppedValues: [],
  };
}

export function buildK6Buckets(points, window, bucketSeconds = 5) {
  const startMs = Date.parse(window.startedAt);
  const endMs = Date.parse(window.endedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new Error('Invalid test window.');
  }
  const bucketMs = Math.max(1000, Number(bucketSeconds) * 1000);
  const first = bucketTimestamp(startMs, bucketMs);
  const last = bucketTimestamp(endMs, bucketMs);
  const buckets = new Map();
  for (let ts = first; ts <= last; ts += bucketMs) buckets.set(ts, emptyBucket(ts));

  for (const point of points) {
    if (point.timestampMs < startMs || point.timestampMs > endMs) continue;
    const key = bucketTimestamp(point.timestampMs, bucketMs);
    if (!buckets.has(key)) buckets.set(key, emptyBucket(key));
    const bucket = buckets.get(key);
    if (point.metric === 'http_req_duration') bucket.latencyValues.push(point.value);
    else if (point.metric === 'http_req_failed') bucket.failedValues.push(point.value);
    else if (point.metric === 'http_reqs') bucket.httpReqValues.push(point.value);
    else if (point.metric === 'iterations') bucket.iterationValues.push(point.value);
    else if (point.metric === 'dropped_iterations') bucket.droppedValues.push(point.value);
  }

  return [...buckets.values()].sort((a, b) => a.timestampMs - b.timestampMs).map((bucket) => ({
    timestamp: bucket.timestamp,
    timestampMs: bucket.timestampMs,
    latencyAvgMs: round(mean(bucket.latencyValues)),
    latencyP95Ms: round(percentile(bucket.latencyValues, 95)),
    errorRate: round(mean(bucket.failedValues)),
    requestRate: round(bucket.httpReqValues.reduce((sum, value) => sum + value, 0) / (bucketMs / 1000)),
    iterationRate: round(bucket.iterationValues.reduce((sum, value) => sum + value, 0) / (bucketMs / 1000)),
    droppedIterations: round(bucket.droppedValues.reduce((sum, value) => sum + value, 0)),
    sampleCounts: {
      latency: bucket.latencyValues.length,
      failures: bucket.failedValues.length,
      requests: bucket.httpReqValues.length,
      iterations: bucket.iterationValues.length,
    },
  }));
}

export function normalizeSignalSeries(samples = []) {
  return samples.map((sample) => ({
    timestamp: new Date(sample.timestamp).toISOString(),
    timestampMs: Date.parse(sample.timestamp),
    value: Number(sample.value),
  })).filter((sample) => Number.isFinite(sample.timestampMs) && Number.isFinite(sample.value))
    .sort((a, b) => a.timestampMs - b.timestampMs);
}

export function bucketSignalSeries(samples, bucketSeconds = 5, aggregation = 'avg') {
  const bucketMs = Math.max(1000, Number(bucketSeconds) * 1000);
  const buckets = new Map();
  for (const sample of normalizeSignalSeries(samples)) {
    const key = bucketTimestamp(sample.timestampMs, bucketMs);
    const values = buckets.get(key) ?? [];
    values.push(sample.value);
    buckets.set(key, values);
  }
  const aggregate = (values) => {
    if (aggregation === 'sum') return values.reduce((sum, value) => sum + value, 0);
    if (aggregation === 'max') return Math.max(...values);
    if (aggregation === 'min') return Math.min(...values);
    if (aggregation === 'last') return values.at(-1);
    return mean(values);
  };
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([timestampMs, values]) => ({
    timestamp: new Date(timestampMs).toISOString(),
    timestampMs,
    value: round(aggregate(values)),
  }));
}

function nearestMap(series, bucketSeconds) {
  const bucketMs = Math.max(1000, Number(bucketSeconds) * 1000);
  return new Map(series.map((sample) => [bucketTimestamp(sample.timestampMs, bucketMs), sample.value]));
}

export function bestLagCorrelation(k6Buckets, signalBuckets, metricKey, maxLagBuckets = 3, minimumBuckets = 6, bucketSeconds = 5) {
  const map = nearestMap(signalBuckets, bucketSeconds);
  const bucketMs = Math.max(1000, Number(bucketSeconds) * 1000);
  const candidates = [];
  for (let lag = -Math.abs(maxLagBuckets); lag <= Math.abs(maxLagBuckets); lag += 1) {
    const xs = [];
    const ys = [];
    for (const bucket of k6Buckets) {
      const x = Number(bucket[metricKey]);
      const y = Number(map.get(bucket.timestampMs + lag * bucketMs));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      xs.push(x);
      ys.push(y);
    }
    const r = pearson(xs, ys);
    if (r !== null && xs.length >= minimumBuckets) candidates.push({ lagBuckets: lag, r, matchedBuckets: xs.length });
  }
  if (!candidates.length) return { r: null, lagBuckets: null, matchedBuckets: 0 };
  return candidates.sort((a, b) => {
    const correlationGap = Math.abs(b.r) - Math.abs(a.r);
    if (Math.abs(correlationGap) > 1e-12) return correlationGap;
    if (b.matchedBuckets !== a.matchedBuckets) return b.matchedBuckets - a.matchedBuckets;
    return Math.abs(a.lagBuckets) - Math.abs(b.lagBuckets);
  })[0];
}

function segmentStats(series, startMs, endMs) {
  const values = series.filter((sample) => sample.timestampMs >= startMs && sample.timestampMs <= endMs).map((sample) => sample.value);
  return {
    samples: values.length,
    mean: round(mean(values)),
    p95: round(percentile(values, 95)),
    max: values.length ? round(Math.max(...values)) : null,
    min: values.length ? round(Math.min(...values)) : null,
  };
}

function slope(series) {
  if (series.length < 3) return null;
  const xs = series.map((_, index) => index);
  const ys = series.map((item) => item.value);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? num / den : null;
}

function evidenceConfidence(matchedBuckets, minimumBuckets) {
  if (matchedBuckets >= Math.max(20, minimumBuckets * 2)) return 'HIGH';
  if (matchedBuckets >= minimumBuckets) return 'MEDIUM';
  return 'LOW';
}

function pctChange(from, to) {
  if (!Number.isFinite(Number(from)) || !Number.isFinite(Number(to)) || Number(from) === 0) return null;
  return (Number(to) - Number(from)) / Math.abs(Number(from));
}

function signalHypotheses(name, spec, analysis, stats) {
  const hypotheses = [];
  const strong = Number(analysis.strongCorrelation ?? 0.65);
  const saturationFraction = Number(analysis.saturationFraction ?? 0.2);
  const role = spec.role ?? 'generic';
  const threshold = Number(spec.threshold);
  const thresholdFinite = Number.isFinite(threshold);
  const latency = stats.correlations.latency;
  const load = stats.correlations.load;
  const error = stats.correlations.error;
  const during = stats.segments.during;
  const pre = stats.segments.pre;
  const post = stats.segments.post;
  const evidence = [];

  if (thresholdFinite && stats.threshold.exceedanceRatio >= saturationFraction) {
    evidence.push(`${name} exceeded ${threshold} in ${(stats.threshold.exceedanceRatio * 100).toFixed(1)}% of during-test samples`);
  }
  const expectedNegative = role === 'cache_hit_ratio';
  const supportsExpectedDirection = (entry) => entry.r !== null && (expectedNegative ? entry.r <= -strong : entry.r >= strong);
  if (supportsExpectedDirection(latency)) {
    evidence.push(`${name} vs latency r=${latency.r.toFixed(3)} at lag ${latency.lagBuckets} buckets`);
  }
  if (supportsExpectedDirection(error)) {
    evidence.push(`${name} vs error rate r=${error.r.toFixed(3)} at lag ${error.lagBuckets} buckets`);
  }
  if (supportsExpectedDirection(load)) {
    evidence.push(`${name} vs iteration rate r=${load.r.toFixed(3)} at lag ${load.lagBuckets} buckets`);
  }

  const confidence = evidenceConfidence(
    Math.max(latency.matchedBuckets, load.matchedBuckets, error.matchedBuckets),
    Number(analysis.minimumMatchedBuckets ?? 6),
  );

  const add = (statement, why = evidence) => hypotheses.push({
    signal: name,
    role,
    confidence,
    statement,
    evidence: why,
    limitation: 'Correlation and threshold overlap are diagnostic evidence, not causal proof. Validate with traces/logs and controlled experiments.',
  });

  const saturated = thresholdFinite && stats.threshold.exceedanceRatio >= saturationFraction;
  if (['cpu_utilization', 'event_loop_utilization'].includes(role) && saturated && latency.r !== null && latency.r >= strong) {
    add(`${role === 'cpu_utilization' ? 'CPU' : 'Event-loop'} saturation is a plausible contributor to latency degradation.`);
  } else if (role === 'cpu_utilization' && saturated) {
    add('CPU saturation occurred during the test, but the temporal link to latency is not strong enough to call it the bottleneck.');
  }

  if (role === 'db_pool_utilization' && saturated && latency.r !== null && latency.r >= strong) {
    add('Database connection-pool saturation is a plausible contributor to request latency.');
  }
  if (role === 'db_wait_ms' && latency.r !== null && latency.r >= strong) {
    add('Database wait time tracks request latency and is a plausible downstream contributor.');
  }
  if (role === 'dependency_latency_ms' && latency.r !== null && latency.r >= strong) {
    add('Downstream dependency latency tracks application latency and is a plausible contributor.');
  }
  if (role === 'cache_hit_ratio' && thresholdFinite && during.mean !== null && during.mean < threshold && latency.r !== null && latency.r <= -strong) {
    add('Cache hit ratio fell below its guardrail while request latency rose, making cache inefficiency a plausible contributor.');
  }
  if (['memory_utilization', 'process_memory_bytes'].includes(role)) {
    const growth = pctChange(pre.mean, post.mean);
    if (growth !== null && growth >= Number(analysis.memoryGrowthFraction ?? 0.1) && stats.duringSlope !== null && stats.duringSlope > 0) {
      add(`Memory remained ${round(growth * 100, 1)}% above the pre-test mean after load and grew during the test; retention/leak is a candidate for longer endurance validation.`,
        [`pre mean=${pre.mean}`, `during mean=${during.mean}`, `post mean=${post.mean}`, `during slope=${round(stats.duringSlope, 5)}`]);
    }
  }
  if (role === 'replicas' && pre.mean !== null && during.max !== null && during.max > pre.mean) {
    add('Autoscaling reacted during the test. Inspect whether the scale-out lag preceded latency/error recovery.',
      [`pre mean replicas=${pre.mean}`, `during max replicas=${during.max}`, load.r !== null ? `replicas vs load r=${load.r.toFixed(3)} lag=${load.lagBuckets}` : 'load correlation insufficient']);
  }
  return hypotheses;
}

export function analyzeSignal(name, spec, samples, context) {
  const bucketSeconds = Number(context.analysis.bucketSeconds ?? 5);
  const bucketMs = Math.max(1000, bucketSeconds * 1000);
  const signalBuckets = bucketSignalSeries(samples, bucketSeconds, spec.aggregation ?? 'avg');
  const startMs = Date.parse(context.window.startedAt);
  const endMs = Date.parse(context.window.endedAt);
  const alignedStartMs = bucketTimestamp(startMs, bucketMs);
  const alignedEndMs = bucketTimestamp(endMs, bucketMs);
  const preMs = startMs - Number(context.analysis.prePaddingSeconds ?? 30) * 1000;
  const postMs = endMs + Number(context.analysis.postPaddingSeconds ?? 30) * 1000;
  const duringSeries = signalBuckets.filter((sample) => sample.timestampMs >= alignedStartMs && sample.timestampMs <= alignedEndMs);
  const threshold = Number(spec.threshold);
  const thresholdFinite = Number.isFinite(threshold);
  const direction = spec.direction ?? (spec.role === 'cache_hit_ratio' ? 'below' : 'above');
  const exceeded = thresholdFinite ? duringSeries.filter((sample) => direction === 'below' ? sample.value < threshold : sample.value > threshold).length : 0;
  const minimumBuckets = Number(context.analysis.minimumMatchedBuckets ?? 6);
  const maxLag = Number(context.analysis.maxLagBuckets ?? 3);
  const correlations = {
    latency: bestLagCorrelation(context.k6Buckets, signalBuckets, 'latencyAvgMs', maxLag, minimumBuckets, bucketSeconds),
    error: bestLagCorrelation(context.k6Buckets, signalBuckets, 'errorRate', maxLag, minimumBuckets, bucketSeconds),
    load: bestLagCorrelation(context.k6Buckets, signalBuckets, 'iterationRate', maxLag, minimumBuckets, bucketSeconds),
  };
  for (const entry of Object.values(correlations)) if (entry.r !== null) entry.r = round(entry.r);
  const stats = {
    signal: name,
    role: spec.role ?? 'generic',
    unit: spec.unit ?? 'unknown',
    samples: signalBuckets.length,
    segments: {
      pre: segmentStats(signalBuckets, preMs, alignedStartMs - 1),
      during: segmentStats(signalBuckets, alignedStartMs, alignedEndMs),
      post: segmentStats(signalBuckets, alignedEndMs + bucketMs, postMs),
    },
    threshold: {
      value: thresholdFinite ? threshold : null,
      direction,
      exceededSamples: exceeded,
      exceedanceRatio: duringSeries.length ? round(exceeded / duringSeries.length) : 0,
    },
    correlations,
    duringSlope: round(slope(duringSeries), 6),
    inferenceEligible: context.k6Buckets.length >= minimumBuckets,
  };
  stats.hypotheses = stats.inferenceEligible ? signalHypotheses(name, spec, context.analysis, stats) : [];
  return stats;
}

export function buildCorrelationReport(run, signalResults, source, analysis = {}) {
  const minimum = Number(analysis.minimumMatchedBuckets ?? 6);
  const synthetic = source.synthetic === true;
  const signals = synthetic ? signalResults.map((result) => ({ ...result, hypotheses: [] })) : signalResults;
  const hypotheses = signals.flatMap((result) => result.hypotheses);
  const strongest = signals.map((result) => ({
    signal: result.signal,
    latencyR: result.correlations.latency.r,
    matchedBuckets: result.correlations.latency.matchedBuckets,
  })).filter((row) => row.latencyR !== null)
    .sort((a, b) => Math.abs(b.latencyR) - Math.abs(a.latencyR));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    run,
    source,
    analysis: {
      bucketSeconds: Number(analysis.bucketSeconds ?? 5),
      minimumMatchedBuckets: minimum,
      strongCorrelation: Number(analysis.strongCorrelation ?? 0.65),
      maxLagBuckets: Number(analysis.maxLagBuckets ?? 3),
      prePaddingSeconds: Number(analysis.prePaddingSeconds ?? 30),
      postPaddingSeconds: Number(analysis.postPaddingSeconds ?? 30),
    },
    quality: {
      k6Buckets: run.k6Buckets,
      sufficientForCorrelation: run.k6Buckets >= minimum,
      inferenceAllowed: run.k6Buckets >= minimum && !synthetic,
      warnings: [
        ...(run.k6Buckets >= minimum ? [] : [`Only ${run.k6Buckets} k6 buckets are available; at least ${minimum} matched buckets are required for correlation claims.`]),
        ...(synthetic ? ['Synthetic telemetry validates correlation plumbing only; operational RCA hypotheses are suppressed and must not be treated as production evidence.'] : []),
      ],
      synthetic,
    },
    signals,
    strongestLatencyCorrelations: strongest,
    hypotheses,
    causalityStatus: 'hypotheses_only_not_causal_proof',
  };
}

export function renderCorrelationMarkdown(report) {
  const lines = [
    '# Post-Test Telemetry Correlation', '',
    `- Protocol: **${report.run.protocol}**`,
    `- Scenario: **${report.run.scenario}**`,
    `- Window: ${report.run.startedAt} → ${report.run.endedAt}`,
    `- Telemetry source: **${report.source.type}**${report.source.synthetic ? ' (synthetic CI evidence)' : ''}`,
    `- k6 buckets: ${report.quality.k6Buckets}`,
    `- Correlation evidence sufficient: **${report.quality.sufficientForCorrelation ? 'yes' : 'no'}**`,
    `- Operational RCA inference allowed: **${report.quality.inferenceAllowed ? 'yes' : 'no'}**`,
    '',
    '> Correlation, threshold overlap and lag alignment do not prove causality. Treat every item below as a hypothesis to validate with traces, logs, controlled changes and repeated tests.',
    '',
  ];
  for (const warning of report.quality.warnings ?? []) lines.push(`> Warning: ${warning}`, '');
  lines.push('## Signals', '', '| Signal | Role | Pre mean | During mean | During p95 | Post mean | Threshold overlap | r(latency) | lag |', '|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const signal of report.signals) {
    lines.push(`| ${signal.signal} | ${signal.role} | ${signal.segments.pre.mean ?? 'n/a'} | ${signal.segments.during.mean ?? 'n/a'} | ${signal.segments.during.p95 ?? 'n/a'} | ${signal.segments.post.mean ?? 'n/a'} | ${(signal.threshold.exceedanceRatio * 100).toFixed(1)}% | ${signal.correlations.latency.r ?? 'n/a'} | ${signal.correlations.latency.lagBuckets ?? 'n/a'} |`);
  }
  lines.push('', '## Evidence-backed hypotheses', '');
  if (report.quality.synthetic) {
    lines.push('- Operational RCA hypotheses were suppressed because the telemetry source is synthetic CI evidence.');
  } else if (!report.quality.sufficientForCorrelation) {
    lines.push('- Statistical RCA hypotheses were suppressed because the minimum matched-bucket requirement was not met.');
  } else if (!report.hypotheses.length) {
    lines.push('- No telemetry-backed bottleneck hypothesis met the configured evidence rules.');
  }
  for (const hypothesis of report.hypotheses) {
    lines.push(`- **${hypothesis.confidence} — ${hypothesis.statement}**`);
    for (const evidence of hypothesis.evidence) lines.push(`  - Evidence: ${evidence}`);
    lines.push(`  - Limitation: ${hypothesis.limitation}`);
  }
  lines.push('', '## Strongest latency correlations', '');
  if (!report.strongestLatencyCorrelations.length) lines.push('- Insufficient matched buckets.');
  for (const row of report.strongestLatencyCorrelations.slice(0, 5)) {
    lines.push(`- ${row.signal}: r=${row.latencyR}, matched buckets=${row.matchedBuckets}`);
  }
  lines.push('');
  return lines.join('\n');
}
