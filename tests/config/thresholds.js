import { env } from './env.js';

export function protocolThresholds() {
  return {
    http_req_failed: [`rate<${env.errorRate}`],
    http_req_duration: [`p(95)<${env.p95Ms}`, `p(99)<${env.p99Ms}`],
    checks: [`rate>${env.checkRate}`],
    dropped_iterations: ['count==0'],
  };
}

export function browserThresholds() {
  return {
    checks: [`rate>${env.checkRate}`],
    browser_web_vital_lcp: [`p(90)<${Number(__ENV.WEB_LCP_MS || 2500)}`],
    browser_web_vital_inp: [`p(90)<${Number(__ENV.WEB_INP_MS || 200)}`],
    browser_web_vital_cls: [`p(90)<${Number(__ENV.WEB_CLS || 0.1)}`],
    browser_web_vital_ttfb: [`p(90)<${Number(__ENV.WEB_TTFB_MS || 800)}`],
  };
}
