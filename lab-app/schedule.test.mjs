import assert from 'node:assert/strict';
import { scheduledInterventionValue } from './schedule.mjs';

assert.equal(
  scheduledInterventionValue({ configuredValue: 120, durationMs: 0 }),
  120,
  'static Phase 5 behavior remains unchanged',
);
assert.equal(
  scheduledInterventionValue({ configuredValue: 120, startAfterMs: 6000, durationMs: 10000, workloadStartedAt: null, nowMs: 9000 }),
  0,
  'scheduled intervention is off before the workload begins',
);
assert.equal(scheduledInterventionValue({ configuredValue: 120, startAfterMs: 6000, durationMs: 10000, workloadStartedAt: 1000, nowMs: 6999 }), 0);
assert.equal(scheduledInterventionValue({ configuredValue: 120, startAfterMs: 6000, durationMs: 10000, workloadStartedAt: 1000, nowMs: 7000 }), 120);
assert.equal(scheduledInterventionValue({ configuredValue: 120, startAfterMs: 6000, durationMs: 10000, workloadStartedAt: 1000, nowMs: 16999 }), 120);
assert.equal(
  scheduledInterventionValue({ configuredValue: 120, startAfterMs: 6000, durationMs: 10000, workloadStartedAt: 1000, nowMs: 17000 }),
  0,
  'intervention recovers after its configured duration',
);

console.log('schedule tests passed');
