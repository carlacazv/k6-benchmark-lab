const n = (name, fallback) => Number(__ENV[name] || fallback);
const d = (name, fallback) => __ENV[name] || fallback;
const baseline = n('BASELINE_RATE', n('BASELINE_RPS', 5));
const peak = n('PEAK_RATE', n('PEAK_RPS', Math.max(10, baseline * 3)));
const limit = n('LIMIT_RATE', n('LIMIT_RPS', peak * 4));
const pre = n('PRE_ALLOCATED_VUS', 20);
const max = n('MAX_VUS', 100);
const arrivalBase = { timeUnit: '1s', preAllocatedVUs: pre, maxVUs: max };

export const workloads = {
  smoke: { executor: 'shared-iterations', vus: 1, iterations: n('SMOKE_ITERATIONS', 3), maxDuration: d('SMOKE_MAX_DURATION', '30s') },
  baseline: { executor: 'constant-arrival-rate', rate: baseline, duration: d('BASELINE_DURATION', '1m'), ...arrivalBase },
  load: { executor: 'ramping-arrival-rate', startRate: baseline, stages: [
    { duration: d('LOAD_RAMP_DURATION', '30s'), target: peak },
    { duration: d('LOAD_HOLD_DURATION', '2m'), target: peak },
    { duration: d('LOAD_RAMP_DOWN_DURATION', '30s'), target: baseline },
  ], ...arrivalBase },
  stress: { executor: 'ramping-arrival-rate', startRate: peak, stages: [
    { duration: d('STRESS_STAGE_DURATION', '1m'), target: Math.ceil(peak * 1.25) },
    { duration: d('STRESS_STAGE_DURATION', '1m'), target: Math.ceil(peak * 1.5) },
    { duration: d('STRESS_STAGE_DURATION', '1m'), target: Math.ceil(peak * 2) },
  ], ...arrivalBase },
  spike: { executor: 'ramping-arrival-rate', startRate: baseline, stages: [
    { duration: d('SPIKE_RAMP_DURATION', '5s'), target: Math.ceil(peak * 3) },
    { duration: d('SPIKE_HOLD_DURATION', '30s'), target: Math.ceil(peak * 3) },
    { duration: d('SPIKE_RECOVERY_DURATION', '30s'), target: baseline },
  ], ...arrivalBase },
  soak: { executor: 'constant-arrival-rate', rate: peak, duration: d('SOAK_DURATION', '30m'), ...arrivalBase },
  breakpoint: { executor: 'ramping-arrival-rate', startRate: baseline, stages: [
    { duration: d('BREAKPOINT_STAGE_DURATION', '1m'), target: peak },
    { duration: d('BREAKPOINT_STAGE_DURATION', '1m'), target: Math.ceil(peak * 1.5) },
    { duration: d('BREAKPOINT_STAGE_DURATION', '1m'), target: Math.ceil(peak * 2) },
    { duration: d('BREAKPOINT_STAGE_DURATION', '1m'), target: limit },
  ], ...arrivalBase },
};

export function selectedScenario(name = __ENV.SCENARIO || 'smoke') {
  const scenario = workloads[name];
  if (!scenario) throw new Error(`Unknown SCENARIO=${name}. Use smoke|baseline|load|stress|spike|soak|breakpoint.`);
  return { [name]: scenario };
}
