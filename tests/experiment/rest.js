import http from 'k6/http';
import { check } from 'k6';

const vus = Math.max(1, Number(__ENV.EXPERIMENT_VUS || 4));
const iterations = Math.max(1, Number(__ENV.EXPERIMENT_ITERATIONS || 40));
const maxDurationSeconds = Math.max(1, Number(__ENV.EXPERIMENT_MAX_DURATION_SECONDS || 30));
const baseUrl = __ENV.TARGET_BASE_URL || 'http://127.0.0.1:3101';

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    controlled_experiment: {
      executor: 'shared-iterations',
      vus,
      iterations,
      maxDuration: `${maxDurationSeconds}s`,
    },
  },
  discardResponseBodies: false,
  tags: { protocol: 'rest', scenario: 'controlled-experiment' },
};

export default function () {
  const response = http.get(`${baseUrl}/api/products?limit=20`, { tags: { endpoint: 'GET /api/products' } });
  check(response, {
    'experiment response is HTTP': (r) => r.status >= 100,
  });
}

export function handleSummary(data) {
  const dir = __ENV.K6_REPORT_DIR || 'artifacts/experiments/manual';
  return {
    [`${dir}/summary.json`]: JSON.stringify({
      meta: {
        protocol: 'rest',
        scenario: 'controlled-experiment',
        role: __ENV.EXPERIMENT_ROLE || 'unknown',
        trial: Number(__ENV.EXPERIMENT_TRIAL || 0),
        generatedAt: new Date().toISOString(),
      },
      ...data,
    }, null, 2),
  };
}
