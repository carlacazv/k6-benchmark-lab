import http from 'k6/http';
import { check } from 'k6';
import { env } from '../config/env.js';
import { selectedScenario } from '../config/workloads.js';
import { protocolThresholds } from '../config/thresholds.js';
import { recordApdex } from '../lib/apdex.js';
import { summaryOutputs } from '../lib/summary.js';

const query = `query Products($limit: Int!) { products(limit: $limit) { id name price } }`;
export const options = { scenarios: selectedScenario(env.scenario), thresholds: protocolThresholds(), discardResponseBodies: false, tags: { protocol: 'graphql', scenario: env.scenario } };
export default function () {
  const payload = JSON.stringify({ operationName: 'Products', query, variables: { limit: 20 } });
  const res = http.post(`${env.baseUrl}/graphql`, payload, { headers: { 'content-type': 'application/json' }, tags: { operation: 'Products' } });
  const ok = check(res, { 'GraphQL HTTP 200': (r) => r.status === 200, 'GraphQL has no errors': (r) => !r.json('errors'), 'GraphQL returns products': (r) => Array.isArray(r.json('data.products')) });
  recordApdex(res.timings.duration, !ok || res.status >= 400, env.apdexT);
}
export function handleSummary(data) { return summaryOutputs(data, { protocol: 'graphql', scenario: env.scenario, target: env.baseUrl }); }
