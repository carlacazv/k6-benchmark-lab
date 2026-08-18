function authorizationHeaders(auth = {}) {
  const mode = auth.mode ?? 'none';
  if (mode === 'none') return {};
  if (mode === 'bearer') {
    const token = process.env[auth.tokenEnv ?? 'PROMETHEUS_TOKEN'];
    if (!token) throw new Error(`Missing bearer token env ${auth.tokenEnv ?? 'PROMETHEUS_TOKEN'}.`);
    return { Authorization: `Bearer ${token}` };
  }
  if (mode === 'basic') {
    const usernameEnv = auth.usernameEnv ?? 'PROMETHEUS_USERNAME';
    const passwordEnv = auth.passwordEnv ?? 'PROMETHEUS_PASSWORD';
    const username = process.env[usernameEnv];
    const password = process.env[passwordEnv];
    if (!username || !password) throw new Error(`Missing Prometheus basic-auth envs ${usernameEnv}/${passwordEnv}.`);
    return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` };
  }
  throw new Error(`Unsupported Prometheus auth.mode=${mode}. Use none|bearer|basic.`);
}

function aggregate(values, mode) {
  if (!values.length) return null;
  if (mode === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (mode === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mode === 'max') return Math.max(...values);
  if (mode === 'min') return Math.min(...values);
  throw new Error(`Unsupported seriesAggregation=${mode}. Use sum|avg|max|min.`);
}

export function parsePrometheusMatrix(payload, seriesAggregation = 'sum') {
  if (payload?.status !== 'success') throw new Error(`Prometheus query failed: ${payload?.error ?? 'unknown response'}`);
  if (payload?.data?.resultType !== 'matrix') throw new Error(`Prometheus query_range returned ${payload?.data?.resultType ?? 'no resultType'}; expected matrix.`);
  const buckets = new Map();
  for (const series of payload.data.result ?? []) {
    for (const pair of series.values ?? []) {
      const timestamp = Number(pair[0]);
      const value = Number(pair[1]);
      if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;
      const values = buckets.get(timestamp) ?? [];
      values.push(value);
      buckets.set(timestamp, values);
    }
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([timestamp, values]) => ({
    timestamp: new Date(timestamp * 1000).toISOString(),
    value: aggregate(values, seriesAggregation),
  }));
}

export async function loadPrometheusSeries(source, config) {
  if (!source.baseUrl || !source.query) throw new Error('prometheus adapter requires source.baseUrl and source.query.');
  const stepSeconds = Number(config.window?.stepSeconds ?? 300);
  const end = config.window?.end ? new Date(config.window.end) : new Date();
  const start = config.window?.start ? new Date(config.window.start) : new Date(end.getTime() - Number(config.window?.days ?? 14) * 86400000);
  const url = new URL(`${String(source.baseUrl).replace(/\/$/, '')}/api/v1/query_range`);
  url.searchParams.set('query', source.query);
  url.searchParams.set('start', start.toISOString());
  url.searchParams.set('end', end.toISOString());
  url.searchParams.set('step', String(stepSeconds));
  const response = await fetch(url, { headers: { Accept: 'application/json', ...authorizationHeaders(source.auth) } });
  if (!response.ok) throw new Error(`Prometheus query_range HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const seriesAggregation = source.seriesAggregation ?? 'sum';
  return {
    samples: parsePrometheusMatrix(payload, seriesAggregation),
    provenance: { type: 'prometheus', baseUrl: source.baseUrl, query: source.query, authMode: source.auth?.mode ?? 'none', seriesAggregation },
  };
}
