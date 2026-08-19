import assert from 'node:assert/strict';
import { classifyExperiment, classifyTrial, median, validateExperimentPlan } from './lib/experiment-core.mjs';

const basePlan = {
  schemaVersion: 1,
  experiment: {
    id: 'dependency-latency',
    hypothesis: 'Increasing downstream latency increases request p95.',
    protocol: 'rest',
    intervention: { variable: 'LAB_DEPENDENCY_LATENCY_MS', control: 0, treatment: 120 },
    workload: { vus: 4, iterations: 40 },
    trials: 3,
    expected: { metric: 'p95_ms', direction: 'increase', minimumRelativeChange: 0.2, minimumAbsoluteChange: 40, requiredConsistency: 0.67 },
    safety: { target: 'local', maxTreatmentValue: 500, maxDurationSeconds: 30 },
  },
};

assert.equal(validateExperimentPlan(basePlan).valid, true);
assert.equal(validateExperimentPlan({ ...basePlan, experiment: { ...basePlan.experiment, safety: { target: 'remote' } } }).valid, false);
assert.equal(validateExperimentPlan({ ...basePlan, experiment: { ...basePlan.experiment, intervention: { variable: 'SHELL_COMMAND', control: 0, treatment: 1 } } }).valid, false);
assert.equal(median([3, 1, 2]), 2);
assert.equal(classifyTrial({ control: 100, treatment: 160, direction: 'increase', minimumRelativeChange: 0.2, minimumAbsoluteChange: 40 }).verdict, 'SUPPORTED');
assert.equal(classifyTrial({ control: 100, treatment: 70, direction: 'increase', minimumRelativeChange: 0.2, minimumAbsoluteChange: 20 }).verdict, 'CONTRADICTED');
assert.equal(classifyTrial({ control: 100, treatment: 110, direction: 'increase', minimumRelativeChange: 0.2, minimumAbsoluteChange: 20 }).verdict, 'INCONCLUSIVE');

const supported = classifyExperiment({
  trials: [{ control: 100, treatment: 180 }, { control: 110, treatment: 190 }, { control: 105, treatment: 170 }],
  expected: basePlan.experiment.expected,
});
assert.equal(supported.status, 'SUPPORTED');
assert.equal(supported.supportCount, 3);

const contradicted = classifyExperiment({
  trials: [{ control: 100, treatment: 60 }, { control: 110, treatment: 70 }, { control: 105, treatment: 65 }],
  expected: basePlan.experiment.expected,
});
assert.equal(contradicted.status, 'CONTRADICTED');

const inconclusive = classifyExperiment({
  trials: [{ control: 100, treatment: 110 }, { control: 110, treatment: 115 }, { control: 105, treatment: 120 }],
  expected: basePlan.experiment.expected,
});
assert.equal(inconclusive.status, 'INCONCLUSIVE');

console.log('experiment-core tests passed');
