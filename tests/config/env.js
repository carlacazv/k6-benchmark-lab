export const env = {
  baseUrl: __ENV.TARGET_BASE_URL || 'http://127.0.0.1:3000',
  scenario: __ENV.SCENARIO || 'smoke',
  p95Ms: Number(__ENV.NFR_P95_MS || 500),
  p99Ms: Number(__ENV.NFR_P99_MS || 1000),
  errorRate: Number(__ENV.ERROR_RATE_THRESHOLD || 0.01),
  checkRate: Number(__ENV.CHECK_RATE_THRESHOLD || 0.99),
  apdexT: Number(__ENV.APDEX_T_MS || 500),
  apdexMin: Number(__ENV.APDEX_MIN || 0.85),
  reportDir: __ENV.K6_REPORT_DIR || 'artifacts/manual',
};
