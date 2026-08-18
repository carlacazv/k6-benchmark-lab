import { Counter } from 'k6/metrics';

export const apdexSatisfied = new Counter('apdex_satisfied');
export const apdexTolerating = new Counter('apdex_tolerating');
export const apdexFrustrated = new Counter('apdex_frustrated');

export function recordApdex(durationMs, failed, tMs) {
  if (!failed && durationMs <= tMs) return apdexSatisfied.add(1);
  if (!failed && durationMs <= tMs * 4) return apdexTolerating.add(1);
  return apdexFrustrated.add(1);
}
