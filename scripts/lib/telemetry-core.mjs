const round = (value, digits = 2) => Number(Number(value).toFixed(digits));

export function normalizeSeries(samples = []) {
  return samples
    .map((sample) => ({ timestamp: new Date(sample.timestamp).toISOString(), value: Number(sample.value) }))
    .filter((sample) => Number.isFinite(sample.value) && Number.isFinite(Date.parse(sample.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const rank = (Number(p) / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function standardDeviation(values, avg) {
  if (!values.length || avg === null) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length);
}

function medianAbsoluteDeviation(values, median) {
  if (!values.length || median === null) return null;
  return percentile(values.map((value) => Math.abs(value - median)), 50);
}

function contiguousEvents(series, threshold, stepSeconds) {
  const flagged = series.filter((sample) => sample.value > threshold);
  if (!flagged.length) return [];
  const groups = [];
  let current = [flagged[0]];
  for (let i = 1; i < flagged.length; i += 1) {
    const gapSeconds = (Date.parse(flagged[i].timestamp) - Date.parse(flagged[i - 1].timestamp)) / 1000;
    if (gapSeconds <= stepSeconds * 1.5) current.push(flagged[i]);
    else { groups.push(current); current = [flagged[i]]; }
  }
  groups.push(current);
  return groups;
}

function busiestHoursUtc(series, limit = 5) {
  const buckets = new Map();
  for (const sample of series) {
    const hour = new Date(sample.timestamp).getUTCHours();
    const current = buckets.get(hour) ?? [];
    current.push(sample.value);
    buckets.set(hour, current);
  }
  return [...buckets.entries()]
    .map(([hour, values]) => ({ hourUtc: hour, averageRate: round(mean(values)), p95Rate: round(percentile(values, 95)) }))
    .sort((a, b) => b.averageRate - a.averageRate)
    .slice(0, limit);
}

function weekdayPattern(series) {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const buckets = new Map();
  for (const sample of series) {
    const day = new Date(sample.timestamp).getUTCDay();
    const current = buckets.get(day) ?? [];
    current.push(sample.value);
    buckets.set(day, current);
  }
  return [...buckets.entries()]
    .map(([day, values]) => ({ weekday: labels[day], averageRate: round(mean(values)), p95Rate: round(percentile(values, 95)) }))
    .sort((a, b) => labels.indexOf(a.weekday) - labels.indexOf(b.weekday));
}

function confidenceFor({ coverageRatio, sampleCount, spanDays, minimumSamples }) {
  if (coverageRatio >= 0.95 && sampleCount >= minimumSamples && spanDays >= 7) return 'HIGH';
  if (coverageRatio >= 0.8 && sampleCount >= Math.min(minimumSamples, 72) && spanDays >= 3) return 'MEDIUM';
  return 'LOW';
}

export function buildWorkloadProfile(seriesInput, config = {}, source = {}) {
  const series = normalizeSeries(seriesInput);
  if (!series.length) throw new Error('Telemetry source produced no numeric samples.');
  const analysis = config.analysis ?? {};
  const window = config.window ?? {};
  const stepSeconds = Number(window.stepSeconds ?? 300);
  const configuredDays = Number(window.days ?? 14);
  const expectedSamples = Math.max(1, Math.floor((configuredDays * 86400) / stepSeconds));
  const actualStart = Date.parse(series[0].timestamp);
  const actualEnd = Date.parse(series.at(-1).timestamp);
  const spanDays = Math.max(stepSeconds / 86400, (actualEnd - actualStart + stepSeconds * 1000) / 86400000);
  const coverageRatio = Math.min(1, series.length / expectedSamples);
  const values = series.map((sample) => sample.value);
  const avg = mean(values);
  const p50 = percentile(values, 50);
  const p75 = percentile(values, 75);
  const p95 = percentile(values, 95);
  const p99 = percentile(values, 99);
  const max = Math.max(...values);
  const sd = standardDeviation(values, avg);
  const mad = medianAbsoluteDeviation(values, p50);
  const baselinePercentile = Number(analysis.baselinePercentile ?? 75);
  const peakPercentile = Number(analysis.peakPercentile ?? 99);
  const baselineRate = percentile(values, baselinePercentile);
  const observedPeakRate = percentile(values, peakPercentile);
  const madMultiplier = Number(analysis.eventMadMultiplier ?? 6);
  const robustUpper = mad && mad > 0 ? p50 + madMultiplier * mad : p99;
  const eventThreshold = Math.max(p99, robustUpper);
  const eventGroups = contiguousEvents(series, eventThreshold, stepSeconds);
  const minEventBuckets = Number(analysis.minimumEventBuckets ?? 2);
  const events = eventGroups.filter((group) => group.length >= minEventBuckets).map((group) => {
    const eventMax = Math.max(...group.map((sample) => sample.value));
    return {
      start: group[0].timestamp,
      end: group.at(-1).timestamp,
      buckets: group.length,
      maxRate: round(eventMax),
      ratioToP99: observedPeakRate ? round(eventMax / observedPeakRate, 3) : null,
      recommendation: 'Review whether this interval was a known business event/incident before using it as a normal capacity requirement.',
    };
  });
  const minimumSamples = Number(analysis.minimumSamples ?? 168);
  const confidence = confidenceFor({ coverageRatio, sampleCount: series.length, spanDays, minimumSamples });
  const warnings = [];
  if (coverageRatio < Number(analysis.minimumCoverageRatio ?? 0.9)) warnings.push(`Coverage ${round(coverageRatio * 100, 1)}% is below the configured minimum.`);
  if (series.length < minimumSamples) warnings.push(`Only ${series.length} samples are available; configured minimum is ${minimumSamples}.`);
  if (spanDays < 7) warnings.push(`Telemetry spans only ${round(spanDays, 2)} days; weekly seasonality may be missed.`);
  if (source.synthetic === true) warnings.push('Source is synthetic; do not treat its rates as production evidence.');
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    unit: config.unit ?? 'iterations_per_second',
    source,
    window: { configuredDays, stepSeconds, actualStart: series[0].timestamp, actualEnd: series.at(-1).timestamp, spanDays: round(spanDays, 3), sampleCount: series.length, expectedSamples, coverageRatio: round(coverageRatio, 4) },
    statistics: { mean: round(avg), p50: round(p50), p75: round(p75), p95: round(p95), p99: round(p99), max: round(max), coefficientOfVariation: avg ? round(sd / avg, 3) : null, medianAbsoluteDeviation: round(mad ?? 0) },
    recommendation: { baselinePercentile, peakPercentile, baselineRate: round(baselineRate), observedPeakRate: round(observedPeakRate), confidence, rationale: `Baseline uses p${baselinePercentile} of observed arrival rate; peak uses p${peakPercentile}. Review detected exceptional events separately before changing the capacity requirement.` },
    patterns: { busiestHoursUtc: busiestHoursUtc(series, Number(analysis.busyHoursTop ?? 5)), weekdays: weekdayPattern(series) },
    eventDetection: { method: 'median + MAD guardrail combined with p99', threshold: round(eventThreshold), madMultiplier, events },
    quality: { confidence, warnings },
  };
}

export function renderWorkloadProfileMarkdown(profile, sourceFile) {
  const lines = [
    '# Production Workload Profile', '', `- Discovery config: ${sourceFile}`, `- Source: **${profile.source.type}**`, `- Confidence: **${profile.quality.confidence}**`, `- Samples: ${profile.window.sampleCount}/${profile.window.expectedSamples} (${(profile.window.coverageRatio * 100).toFixed(1)}% coverage)`, `- Window: ${profile.window.actualStart} → ${profile.window.actualEnd} (${profile.window.spanDays} days)`, '',
    '## Distribution', '', `- mean: ${profile.statistics.mean} ops/s`, `- p50: ${profile.statistics.p50} ops/s`, `- p75: ${profile.statistics.p75} ops/s`, `- p95: ${profile.statistics.p95} ops/s`, `- p99: ${profile.statistics.p99} ops/s`, `- max: ${profile.statistics.max} ops/s`, `- coefficient of variation: ${profile.statistics.coefficientOfVariation}`, '',
    '## Suggested workload', '', `- Baseline: **${profile.recommendation.baselineRate} ops/s** (p${profile.recommendation.baselinePercentile})`, `- Observed peak: **${profile.recommendation.observedPeakRate} ops/s** (p${profile.recommendation.peakPercentile})`, `- Rationale: ${profile.recommendation.rationale}`, '',
    '## Busiest UTC hours', '', '| Hour | Avg ops/s | p95 ops/s |', '|---:|---:|---:|', ...profile.patterns.busiestHoursUtc.map((row) => `| ${String(row.hourUtc).padStart(2, '0')}:00 | ${row.averageRate} | ${row.p95Rate} |`), '', '## Exceptional intervals', '',
  ];
  if (!profile.eventDetection.events.length) lines.push('- None detected by the configured robust threshold.');
  for (const event of profile.eventDetection.events) lines.push(`- ${event.start} → ${event.end}: ${event.buckets} buckets, max ${event.maxRate} ops/s (${event.ratioToP99}× p99). ${event.recommendation}`);
  lines.push('', '## Data-quality warnings', '');
  if (!profile.quality.warnings.length) lines.push('- None.');
  for (const warning of profile.quality.warnings) lines.push(`- ${warning}`);
  lines.push('', '> Discovery suggests a workload model; it does not silently redefine an NFR. A human should review event context and business forecasts before approving the performance plan.', '');
  return lines.join('\n');
}

export function planVolumeSuggestion(profile, profilePath) {
  return ['volume:', '  unit: iterations_per_second', `  discoveryProfile: ${profilePath}`, '  discoveryRequired: true', `  discoveryMinimumConfidence: ${profile.quality.confidence === 'HIGH' ? 'MEDIUM' : profile.quality.confidence}`, `  observedBaselineRate: ${profile.recommendation.baselineRate}`, `  observedPeakRate: ${profile.recommendation.observedPeakRate}`, ''].join('\n');
}
