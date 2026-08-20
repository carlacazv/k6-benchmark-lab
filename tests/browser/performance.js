import { browser } from 'k6/browser';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { env } from '../config/env.js';
import { browserThresholds } from '../config/thresholds.js';
import { recordApdex } from '../lib/apdex.js';
import { summaryOutputs } from '../lib/summary.js';

const userFlow = new Trend('browser_user_flow_duration', true);
const defaultBrowserIterations = env.scenario === 'smoke' ? 1 : 2;

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: { browser: { executor: 'shared-iterations', vus: Number(__ENV.BROWSER_VUS || 1), iterations: Number(__ENV.BROWSER_ITERATIONS || defaultBrowserIterations), maxDuration: __ENV.BROWSER_MAX_DURATION || '1m', options: { browser: { type: 'chromium' } } } },
  thresholds: browserThresholds(),
  tags: { protocol: 'browser', scenario: env.scenario },
};
export default async function () {
  const page = await browser.newPage();
  const started = Date.now();
  let failed = false;
  try {
    const response = await page.goto(env.baseUrl, { waitUntil: 'networkidle' });
    const status = response ? response.status() : 0;
    const text = await page.locator('#status').textContent();
    const ok = check(status, { 'frontend document 200': (s) => s === 200 }) && check(text, { 'frontend loaded products': (v) => String(v).includes('Loaded') });
    failed = !ok;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const duration = Date.now() - started;
    userFlow.add(duration);
    recordApdex(duration, failed, Number(__ENV.BROWSER_APDEX_T_MS || 1500));
    await page.close();
  }
}
export function handleSummary(data) { return summaryOutputs(data, { protocol: 'browser', scenario: env.scenario, target: env.baseUrl }); }
