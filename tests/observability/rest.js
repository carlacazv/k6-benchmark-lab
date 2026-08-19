import http from 'k6/http';
import { check } from 'k6';
import { summaryOutputs } from '../lib/summary.js';

const baseUrl = __ENV.TARGET_BASE_URL || 'http://127.0.0.1:3201';
const durationSeconds = Math.max(18, Number(__ENV.OBSERVABILITY_DURATION_SECONDS || 24));
const vus = Math.max(1, Math.min(10, Number(__ENV.OBSERVABILITY_VUS || 4)));

export const options = {
  vus,
  duration: `${durationSeconds}s`,
  gracefulStop: '1s',
  discardResponseBodies: true,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  tags: { protocol: 'observability', scenario: 'real-prometheus' },
};

export default function () {
  const response = http.get(`${baseUrl}/api/products?limit=20`, {
    tags: { endpoint: 'GET /api/products', purpose: 'real-observability-validation' },
  });
  check(response, { 'observability REST status 200': (r) => r.status === 200 });
}

export function handleSummary(data) {
  return summaryOutputs(data, {
    protocol: 'observability',
    scenario: 'real-prometheus',
    target: baseUrl,
  });
}
