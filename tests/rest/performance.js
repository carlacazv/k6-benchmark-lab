import http from 'k6/http';
import { check } from 'k6';
import { env } from '../config/env.js';
import { selectedScenario } from '../config/workloads.js';
import { protocolThresholds } from '../config/thresholds.js';
import { recordApdex } from '../lib/apdex.js';
import { summaryOutputs } from '../lib/summary.js';

export const options = { scenarios: selectedScenario(env.scenario), thresholds: protocolThresholds(), discardResponseBodies: false, tags: { protocol: 'rest', scenario: env.scenario } };
export default function () {
  const res = http.get(`${env.baseUrl}/api/products?limit=20`, { tags: { endpoint: 'GET /api/products' } });
  const ok = check(res, { 'REST status 200': (r) => r.status === 200, 'REST body has items': (r) => Array.isArray(r.json('items')) });
  recordApdex(res.timings.duration, !ok || res.status >= 400, env.apdexT);
}
export function handleSummary(data) { return summaryOutputs(data, { protocol: 'rest', scenario: env.scenario, target: env.baseUrl }); }
