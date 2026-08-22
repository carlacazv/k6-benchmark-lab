import { browser } from 'k6/browser';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { env } from '../../tests/config/env.js';
import { recordApdex } from '../../tests/lib/apdex.js';
import { summaryOutputs } from '../../tests/lib/summary.js';

const roomCreateDuration = new Trend('planning_poker_room_create_ms', true);

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    planning_poker_browser_smoke: {
      executor: 'shared-iterations',
      vus: Number(__ENV.BROWSER_VUS || 1),
      iterations: Number(__ENV.BROWSER_ITERATIONS || 1),
      maxDuration: __ENV.BROWSER_MAX_DURATION || '1m',
      options: { browser: { type: 'chromium' } },
    },
  },
  thresholds: {
    checks: [`rate>${env.checkRate}`],
    planning_poker_room_create_ms: [`p(95)<${Number(__ENV.PLANNING_POKER_ROOM_CREATE_P95_MS || 4000)}`],
  },
  tags: { protocol: 'browser', scenario: 'planning-poker-smoke', use_case: 'planning-poker' },
};

export default async function () {
  const page = await browser.newPage();
  const flowStarted = Date.now();
  let failed = false;

  try {
    const response = await page.goto(env.baseUrl, { waitUntil: 'domcontentloaded' });
    const documentOk = check(response?.status() || 0, {
      'planning poker document returned 200': (status) => status === 200,
    });

    const name = `k6-host-${__VU}-${__ITER}-${Date.now()}`;
    await page.locator('input[placeholder="Ex.: Ana"]').fill(name);
    await page.locator('button[type="submit"]').click();

    const roomCode = page.locator('button[title="Copiar código da sala"]');
    await roomCode.waitFor({ state: 'visible', timeout: 10000 });
    const code = String(await roomCode.textContent()).trim();

    const roomOk = check(code, {
      'room creation produced a five-character code': (value) => /^[A-Z2-9]{5}$/.test(value),
    });

    failed = !(documentOk && roomOk);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const duration = Date.now() - flowStarted;
    roomCreateDuration.add(duration);
    recordApdex(duration, failed, Number(__ENV.PLANNING_POKER_APDEX_T_MS || 1500));
    await page.close();
  }
}

export function handleSummary(data) {
  return summaryOutputs(data, {
    protocol: 'browser',
    scenario: 'planning-poker-smoke',
    target: env.baseUrl,
    useCase: 'planning-poker',
  });
}
