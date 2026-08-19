function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function normalize(values, value) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (!clean.length) return 0;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  if (max === min) return value > 0 ? 1 : 0;
  return clamp((value - min) / (max - min), 0, 1);
}

function nearestBucket(k6Buckets, ts, bucketMs) {
  if (!k6Buckets.length) return null;
  const key = Math.floor(ts / bucketMs) * bucketMs;
  return k6Buckets.find((bucket) => bucket.timestampMs === key) ?? null;
}

function valueForRole(role, phase, load, latency, progress) {
  if (role === 'cpu_utilization') return phase === 'during' ? 0.28 + 0.62 * load : phase === 'post' ? 0.3 : 0.25;
  if (role === 'memory_utilization') return phase === 'during' ? 0.4 + 0.18 * progress + 0.08 * load : phase === 'post' ? 0.58 : 0.4;
  if (role === 'process_memory_bytes') return (phase === 'during' ? 120 + 35 * progress + 15 * load : phase === 'post' ? 155 : 120) * 1024 * 1024;
  if (role === 'db_pool_utilization') return phase === 'during' ? 0.2 + 0.72 * load : 0.2;
  if (role === 'db_wait_ms') return phase === 'during' ? 4 + 0.35 * latency : 4;
  if (role === 'dependency_latency_ms') return phase === 'during' ? 12 + 0.72 * latency : 12;
  if (role === 'cache_hit_ratio') return phase === 'during' ? 0.96 - 0.24 * load : 0.96;
  if (role === 'event_loop_utilization') return phase === 'during' ? 0.25 + 0.62 * load : 0.22;
  if (role === 'replicas') return phase === 'during' && progress > 0.6 ? 2 : 1;
  return phase === 'during' ? 1 + load : 1;
}

export async function loadSyntheticSignals(source, signals, window, analysis, k6Buckets) {
  const bucketSeconds = Number(analysis.bucketSeconds ?? 5);
  const bucketMs = bucketSeconds * 1000;
  const startMs = Date.parse(window.startedAt);
  const endMs = Date.parse(window.endedAt);
  const queryStartMs = Date.parse(window.queryStart);
  const queryEndMs = Date.parse(window.queryEnd);
  const loadValues = k6Buckets.map((bucket) => bucket.iterationRate ?? 0);
  const latencyValues = k6Buckets.map((bucket) => bucket.latencyAvgMs ?? 0);
  const out = {};
  for (const [name, spec] of Object.entries(signals ?? {})) {
    const samples = [];
    for (let ts = Math.floor(queryStartMs / bucketMs) * bucketMs; ts <= queryEndMs; ts += bucketMs) {
      const phase = ts < startMs ? 'pre' : ts > endMs ? 'post' : 'during';
      const bucket = nearestBucket(k6Buckets, ts, bucketMs);
      const rawLoad = Number(bucket?.iterationRate ?? 0);
      const rawLatency = Number(bucket?.latencyAvgMs ?? 0);
      const load = normalize(loadValues, rawLoad);
      const latency = normalize(latencyValues, rawLatency) * 500 + rawLatency;
      const progress = phase === 'during' && endMs > startMs ? clamp((ts - startMs) / (endMs - startMs), 0, 1) : phase === 'post' ? 1 : 0;
      const value = valueForRole(spec.role ?? 'generic', phase, load, latency, progress);
      samples.push({ timestamp: new Date(ts).toISOString(), value: Number(value.toFixed(6)) });
    }
    out[name] = samples;
  }
  return {
    signals: out,
    provenance: {
      type: 'synthetic',
      synthetic: true,
      note: source.note ?? 'CI-only deterministic telemetry derived from the test timeline. Never treat as production evidence.',
    },
  };
}
