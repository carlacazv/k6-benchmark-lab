const allowedVariables = new Set([
  'LAB_BASE_LATENCY_MS',
  'LAB_DEPENDENCY_LATENCY_MS',
  'LAB_DB_WAIT_MS',
  'LAB_CPU_BURN_MS',
  'LAB_ERROR_RATE',
]);

export function median(values) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const middle = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[middle] : (xs[middle - 1] + xs[middle]) / 2;
}

export function validateExperimentPlan(plan) {
  const errors = [];
  if (Number(plan?.schemaVersion) !== 1) errors.push('schemaVersion must be 1.');
  const experiment = plan?.experiment;
  if (!experiment?.id) errors.push('experiment.id is required.');
  if (!experiment?.hypothesis) errors.push('experiment.hypothesis is required.');
  if ((experiment?.protocol ?? 'rest') !== 'rest') errors.push('Only REST experiments are supported in Phase 5.');

  const intervention = experiment?.intervention ?? {};
  if (!allowedVariables.has(intervention.variable)) errors.push(`Unsupported intervention variable: ${intervention.variable ?? 'missing'}.`);
  if (!Number.isFinite(Number(intervention.control)) || !Number.isFinite(Number(intervention.treatment))) errors.push('Intervention control/treatment must be numeric.');
  if (Number(intervention.control) === Number(intervention.treatment)) errors.push('Control and treatment must differ.');

  const workload = experiment?.workload ?? {};
  if (!Number.isInteger(Number(workload.vus)) || Number(workload.vus) < 1 || Number(workload.vus) > 20) errors.push('workload.vus must be an integer between 1 and 20.');
  if (!Number.isInteger(Number(workload.iterations)) || Number(workload.iterations) < 10 || Number(workload.iterations) > 500) errors.push('workload.iterations must be an integer between 10 and 500.');
  if (!Number.isInteger(Number(experiment?.trials)) || Number(experiment.trials) < 3 || Number(experiment.trials) > 9) errors.push('experiment.trials must be an integer between 3 and 9.');

  const expected = experiment?.expected ?? {};
  if (!['p95_ms', 'error_rate', 'throughput_rps'].includes(expected.metric)) errors.push('expected.metric must be p95_ms, error_rate, or throughput_rps.');
  if (!['increase', 'decrease'].includes(expected.direction)) errors.push('expected.direction must be increase or decrease.');
  if (!(Number(expected.minimumRelativeChange) >= 0)) errors.push('expected.minimumRelativeChange must be >= 0.');
  if (!(Number(expected.minimumAbsoluteChange) >= 0)) errors.push('expected.minimumAbsoluteChange must be >= 0.');
  const requiredConsistency = Number(expected.requiredConsistency ?? 0.67);
  if (!(requiredConsistency > 0.5 && requiredConsistency <= 1)) errors.push('expected.requiredConsistency must be > 0.5 and <= 1.');

  const safety = experiment?.safety ?? {};
  if ((safety.target ?? 'local') !== 'local') errors.push('Phase 5 experiments are restricted to the controlled local lab target.');
  if (!(Number(safety.maxDurationSeconds ?? 30) > 0 && Number(safety.maxDurationSeconds ?? 30) <= 60)) errors.push('safety.maxDurationSeconds must be > 0 and <= 60.');
  const maxTreatment = Number(safety.maxTreatmentValue);
  if (Number.isFinite(maxTreatment) && Math.abs(Number(intervention.treatment)) > Math.abs(maxTreatment)) errors.push('Treatment exceeds safety.maxTreatmentValue.');

  return { valid: errors.length === 0, errors };
}

export function metricFromSummary(summary, metric) {
  const values = summary?.metrics;
  if (!values) return null;
  if (metric === 'p95_ms') return Number(values.http_req_duration?.values?.['p(95)']);
  if (metric === 'error_rate') return Number(values.http_req_failed?.values?.rate);
  if (metric === 'throughput_rps') return Number(values.http_reqs?.values?.rate);
  return null;
}

function directionalDelta(control, treatment, direction) {
  const absolute = treatment - control;
  const relative = Math.abs(control) > Number.EPSILON ? absolute / Math.abs(control) : (Math.abs(treatment) > Number.EPSILON ? Math.sign(absolute) * Infinity : 0);
  const signedAbsolute = direction === 'increase' ? absolute : -absolute;
  const signedRelative = direction === 'increase' ? relative : -relative;
  return { absolute, relative, signedAbsolute, signedRelative };
}

export function classifyTrial({ control, treatment, direction, minimumRelativeChange, minimumAbsoluteChange }) {
  if (![control, treatment].every(Number.isFinite)) return { verdict: 'INCONCLUSIVE', reason: 'missing_metric' };
  const delta = directionalDelta(control, treatment, direction);
  const relFloor = Number(minimumRelativeChange ?? 0);
  const absFloor = Number(minimumAbsoluteChange ?? 0);
  const supports = delta.signedRelative >= relFloor && delta.signedAbsolute >= absFloor;
  const contradicts = delta.signedRelative <= -relFloor && delta.signedAbsolute <= -absFloor;
  return {
    verdict: supports ? 'SUPPORTED' : contradicts ? 'CONTRADICTED' : 'INCONCLUSIVE',
    ...delta,
  };
}

export function classifyExperiment({ trials, expected }) {
  const evaluated = trials.map((trial) => ({
    ...trial,
    evaluation: classifyTrial({
      control: trial.control,
      treatment: trial.treatment,
      direction: expected.direction,
      minimumRelativeChange: expected.minimumRelativeChange,
      minimumAbsoluteChange: expected.minimumAbsoluteChange,
    }),
  }));
  const supportCount = evaluated.filter((x) => x.evaluation.verdict === 'SUPPORTED').length;
  const contradictCount = evaluated.filter((x) => x.evaluation.verdict === 'CONTRADICTED').length;
  const denominator = Math.max(1, evaluated.length);
  const required = Number(expected.requiredConsistency ?? 0.67);
  const medianControl = median(evaluated.map((x) => x.control));
  const medianTreatment = median(evaluated.map((x) => x.treatment));
  const aggregate = classifyTrial({
    control: medianControl,
    treatment: medianTreatment,
    direction: expected.direction,
    minimumRelativeChange: expected.minimumRelativeChange,
    minimumAbsoluteChange: expected.minimumAbsoluteChange,
  });

  let status = 'INCONCLUSIVE';
  if (supportCount / denominator >= required && aggregate.verdict === 'SUPPORTED') status = 'SUPPORTED';
  else if (contradictCount / denominator >= required && aggregate.verdict === 'CONTRADICTED') status = 'CONTRADICTED';

  return {
    status,
    supportCount,
    contradictCount,
    inconclusiveCount: evaluated.length - supportCount - contradictCount,
    consistency: status === 'SUPPORTED' ? supportCount / denominator : status === 'CONTRADICTED' ? contradictCount / denominator : Math.max(supportCount, contradictCount) / denominator,
    medianControl,
    medianTreatment,
    aggregate,
    trials: evaluated,
    caveat: 'Controlled intervention increases causal evidence under lab conditions, but does not prove production causality or external validity.',
  };
}
