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

export function parsePrometheusMatrix(payload) {
  if (payload?.status !== 'success') throw new Error(`Prometheus query failed: ${payload?.error ?? 'unknown response'}`);
  if (payload?.data?.resultType !== 'matrix') throw new Error(`Prometheus query_range returned ${payload?.data?.resultType ?? 'no resultType'}; expected matrix.`);
  const sums = new Map();
  for (const series of payload.data.result ?? []) {
    for (const pair of series.values ?? []) {
      const timestamp = Number(pair[0]);
      const value = Number(pair[1]);
      if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;
      sums.set(timestamp, (sums.get(timestamp) ?? 0) + value);
    }
  }
  return [...sums.entries()].sort((a, b) => a[0] - b[0]).map(([timestamp, value]) => ({ timestamp: new Date(timestamp * 1000).toISOString(), value }));
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
  return { samples: parsePrometheusMatrix(payload), provenance: { type: 'prometheus', baseUrl: source.baseUrl, query: source.query, authMode: source.auth?.mode ?? 'none' } };
}
