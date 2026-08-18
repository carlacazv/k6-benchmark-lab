function authHeaders(source = {}) {
  const apiKeyEnv = source.apiKeyEnv ?? 'DD_API_KEY';
  const appKeyEnv = source.appKeyEnv ?? 'DD_APP_KEY';
  const apiKey = process.env[apiKeyEnv];
  const appKey = process.env[appKeyEnv];
  if (!apiKey || !appKey) throw new Error(`Missing Datadog auth envs ${apiKeyEnv}/${appKeyEnv}.`);
  return { 'DD-API-KEY': apiKey, 'DD-APPLICATION-KEY': appKey, Accept: 'application/json' };
}

function aggregate(values, mode) {
  if (!values.length) return null;
  if (mode === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (mode === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mode === 'max') return Math.max(...values);
  if (mode === 'min') return Math.min(...values);
  throw new Error(`Unsupported seriesAggregation=${mode}. Use sum|avg|max|min.`);
}

export function parseDatadogSeries(payload, seriesAggregation = 'sum') {
  if (payload?.status && payload.status !== 'ok') throw new Error(`Datadog query failed: ${payload.error ?? payload.status}`);
  const buckets = new Map();
  for (const series of payload?.series ?? []) {
    for (const point of series.pointlist ?? []) {
      const timestampMs = Number(point[0]);
      const value = Number(point[1]);
      if (!Number.isFinite(timestampMs) || !Number.isFinite(value)) continue;
      const values = buckets.get(timestampMs) ?? [];
      values.push(value);
      buckets.set(timestampMs, values);
    }
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([timestampMs, values]) => ({
    timestamp: new Date(timestampMs).toISOString(),
    value: aggregate(values, seriesAggregation),
  }));
}

export async function loadDatadogSeries(source, config) {
  if (!source.query) throw new Error('datadog adapter requires source.query.');
  const end = config.window?.end ? new Date(config.window.end) : new Date();
  const start = config.window?.start ? new Date(config.window.start) : new Date(end.getTime() - Number(config.window?.days ?? 14) * 86400000);
  const baseUrl = String(source.baseUrl ?? 'https://api.datadoghq.com').replace(/\/$/, '');
  const url = new URL(`${baseUrl}/api/v1/query`);
  url.searchParams.set('from', String(Math.floor(start.getTime() / 1000)));
  url.searchParams.set('to', String(Math.floor(end.getTime() / 1000)));
  url.searchParams.set('query', source.query);
  const response = await fetch(url, { headers: authHeaders(source) });
  if (!response.ok) throw new Error(`Datadog metrics query HTTP ${response.status}: ${await response.text()}`);
  const seriesAggregation = source.seriesAggregation ?? 'sum';
  return {
    samples: parseDatadogSeries(await response.json(), seriesAggregation),
    provenance: { type: 'datadog', baseUrl, query: source.query, seriesAggregation },
  };
}
