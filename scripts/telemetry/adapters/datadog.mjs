function authHeaders(source = {}) {
  const apiKeyEnv = source.apiKeyEnv ?? 'DD_API_KEY';
  const appKeyEnv = source.appKeyEnv ?? 'DD_APP_KEY';
  const apiKey = process.env[apiKeyEnv];
  const appKey = process.env[appKeyEnv];
  if (!apiKey || !appKey) throw new Error(`Missing Datadog auth envs ${apiKeyEnv}/${appKeyEnv}.`);
  return { 'DD-API-KEY': apiKey, 'DD-APPLICATION-KEY': appKey, Accept: 'application/json' };
}

export function parseDatadogSeries(payload) {
  if (payload?.status && payload.status !== 'ok') throw new Error(`Datadog query failed: ${payload.error ?? payload.status}`);
  const sums = new Map();
  for (const series of payload?.series ?? []) {
    for (const point of series.pointlist ?? []) {
      const timestampMs = Number(point[0]);
      const value = Number(point[1]);
      if (!Number.isFinite(timestampMs) || !Number.isFinite(value)) continue;
      sums.set(timestampMs, (sums.get(timestampMs) ?? 0) + value);
    }
  }
  return [...sums.entries()].sort((a, b) => a[0] - b[0]).map(([timestampMs, value]) => ({ timestamp: new Date(timestampMs).toISOString(), value }));
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
  return { samples: parseDatadogSeries(await response.json()), provenance: { type: 'datadog', baseUrl, query: source.query } };
}
