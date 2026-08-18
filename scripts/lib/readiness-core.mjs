const SCENARIOS = new Set(['smoke', 'baseline', 'load', 'stress', 'spike', 'soak', 'breakpoint']);
const OBJECTIVE_TO_SCENARIO = {
  sanity: 'smoke',
  establish_baseline: 'baseline',
  validate_expected_peak: 'load',
  validate_sudden_peak: 'spike',
  find_degradation_point: 'stress',
  validate_stability: 'soak',
  find_breakpoint: 'breakpoint',
};

const isFinitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const round = (value, decimals = 2) => Number(Number(value).toFixed(decimals));

function issue(severity, code, message, recommendation) {
  return { severity, code, message, recommendation };
}

export function recommendScenario(objective = 'sanity') {
  const scenario = OBJECTIVE_TO_SCENARIO[objective];
  if (!scenario) throw new Error(`Unknown objective.type=${objective}. Use ${Object.keys(OBJECTIVE_TO_SCENARIO).join('|')}.`);
  return scenario;
}

export function deriveTraffic(plan) {
  const volume = plan.volume ?? {};
  let baselineSource = 'unknown';
  let baseline = null;

  if (isFinitePositive(volume.observedBaselineRate)) {
    baseline = Number(volume.observedBaselineRate);
    baselineSource = 'observedBaselineRate';
  } else if (isFinitePositive(volume.activeUsers) && isFinitePositive(volume.operationsPerUser) && isFinitePositive(volume.observationWindowSeconds)) {
    baseline = (Number(volume.activeUsers) * Number(volume.operationsPerUser)) / Number(volume.observationWindowSeconds);
    baselineSource = 'business_estimate';
  }

  if (!baseline) return { baseline: null, observedPeak: null, designPeak: null, explorationCeiling: null, baselineSource };

  const observedPeak = isFinitePositive(volume.observedPeakRate)
    ? Number(volume.observedPeakRate)
    : baseline * Number(volume.peakFactor ?? 2);
  const headroomPercent = Number(volume.headroomPercent ?? 20);
  const designPeak = observedPeak * (1 + headroomPercent / 100);
  const explorationMultiplier = Number(volume.explorationCeilingMultiplier ?? 2);
  const explorationCeiling = designPeak * explorationMultiplier;

  return {
    baseline: round(baseline),
    observedPeak: round(observedPeak),
    designPeak: round(designPeak),
    explorationCeiling: round(explorationCeiling),
    baselineSource,
    headroomPercent,
    explorationMultiplier,
  };
}

function capacity(environment = {}) {
  const production = environment.production ?? {};
  const test = environment.test ?? {};
  const prodCpu = Number(production.replicas) * Number(production.cpuCoresPerReplica);
  const testCpu = Number(test.replicas) * Number(test.cpuCoresPerReplica);
  const prodMemory = Number(production.replicas) * Number(production.memoryMbPerReplica);
  const testMemory = Number(test.replicas) * Number(test.memoryMbPerReplica);
  const prodReplicas = Number(production.replicas);
  const testReplicas = Number(test.replicas);

  if (![prodCpu, testCpu, prodMemory, testMemory, prodReplicas, testReplicas].every(isFinitePositive)) {
    return { complete: false };
  }

  const cpuRatio = testCpu / prodCpu;
  const memoryRatio = testMemory / prodMemory;
  const replicaRatio = testReplicas / prodReplicas;
  return {
    complete: true,
    production: { totalCpuCores: prodCpu, totalMemoryMb: prodMemory, replicas: prodReplicas },
    test: { totalCpuCores: testCpu, totalMemoryMb: testMemory, replicas: testReplicas },
    ratios: {
      cpu: round(cpuRatio, 3),
      memory: round(memoryRatio, 3),
      replicas: round(replicaRatio, 3),
      effective: round(Math.min(cpuRatio, memoryRatio), 3),
    },
  };
}

function maxRateForScenario(scenario, traffic) {
  const design = traffic.designPeak ?? traffic.observedPeak ?? traffic.baseline ?? 1;
  switch (scenario) {
    case 'smoke': return 1;
    case 'baseline': return traffic.baseline;
    case 'load': return design;
    case 'stress': return design * 2;
    case 'spike': return design * 3;
    case 'soak': return design;
    case 'breakpoint': return traffic.explorationCeiling;
    default: return design;
  }
}

function estimatedVus(maxRate, p99Ms, safetyFactor) {
  const seconds = Math.max(Number(p99Ms || 1000) / 1000, 0.1);
  const estimate = Math.ceil(Number(maxRate || 1) * seconds * Number(safetyFactor || 1.5));
  const preAllocatedVUs = Math.max(10, estimate);
  return { preAllocatedVUs, maxVUs: Math.max(20, Math.ceil(preAllocatedVUs * 2)), safetyFactor: Number(safetyFactor || 1.5) };
}

export function assessPlan(plan, scenarioOverride) {
  const blockers = [];
  const warnings = [];
  const notes = [];
  const objective = plan.objective?.type ?? 'sanity';
  let recommendedScenario;
  try {
    recommendedScenario = recommendScenario(objective);
  } catch (error) {
    blockers.push(issue('blocker', 'OBJECTIVE_UNKNOWN', error.message, 'Choose an objective supported by the scenario guide.'));
    recommendedScenario = 'smoke';
  }

  const scenario = scenarioOverride && scenarioOverride !== 'auto' ? scenarioOverride : recommendedScenario;
  if (!SCENARIOS.has(scenario)) blockers.push(issue('blocker', 'SCENARIO_UNKNOWN', `Unknown scenario ${scenario}.`, 'Use smoke|baseline|load|stress|spike|soak|breakpoint.'));

  if (plan.target?.authorized !== true) {
    blockers.push(issue('blocker', 'TARGET_NOT_AUTHORIZED', 'The plan does not explicitly declare the target as authorized for performance testing.', 'Set target.authorized=true only after obtaining permission or use infrastructure you own.'));
  }
  if (scenario !== 'smoke' && !String(plan.target?.baseUrl ?? '').trim()) {
    blockers.push(issue('blocker', 'TARGET_URL_MISSING', 'A non-smoke plan must declare target.baseUrl explicitly.', 'Set the authorized test target URL in the plan; do not rely on an implicit default for load generation.'));
  }

  const nfr = plan.nfr ?? {};
  for (const [field, label] of [['p95Ms', 'p95'], ['p99Ms', 'p99'], ['errorRate', 'error rate'], ['apdexTMs', 'Apdex T'], ['apdexMin', 'minimum Apdex']]) {
    if (!isFinitePositive(nfr[field]) && !(field === 'errorRate' && Number(nfr[field]) === 0)) {
      blockers.push(issue('blocker', `NFR_${field.toUpperCase()}_MISSING`, `NFR ${label} is missing or invalid.`, 'Agree the non-functional acceptance criterion before load execution.'));
    }
  }
  if (isFinitePositive(nfr.p95Ms) && isFinitePositive(nfr.p99Ms) && Number(nfr.p99Ms) < Number(nfr.p95Ms)) {
    blockers.push(issue('blocker', 'NFR_PERCENTILES_INVALID', 'nfr.p99Ms is lower than nfr.p95Ms.', 'Correct the percentile acceptance criteria.'));
  }
  if (Number(nfr.errorRate) < 0 || Number(nfr.errorRate) > 1) blockers.push(issue('blocker', 'NFR_ERROR_RATE_INVALID', 'nfr.errorRate must be expressed as a fraction between 0 and 1.', 'Use 0.01 for 1%, for example.'));
  if (!isFinitePositive(nfr.checkRate) || Number(nfr.checkRate) > 1) blockers.push(issue('blocker', 'NFR_CHECK_RATE_INVALID', 'nfr.checkRate must be a fraction greater than 0 and at most 1.', 'Use 0.99 for a 99% check success criterion, for example.'));
  if (Number(nfr.apdexMin) <= 0 || Number(nfr.apdexMin) > 1) blockers.push(issue('blocker', 'NFR_APDEX_INVALID', 'nfr.apdexMin must be greater than 0 and at most 1.', 'Choose a project-specific Apdex acceptance floor.'));

  const trafficUnit = plan.volume?.unit;
  if (scenario !== 'smoke' && trafficUnit !== 'iterations_per_second') {
    blockers.push(issue('blocker', 'TRAFFIC_UNIT_UNSUPPORTED', `volume.unit=${trafficUnit ?? 'missing'} is not executable by this readiness engine.`, 'Use iterations_per_second and make one k6 iteration represent one measured business operation.'));
  }
  if (scenario !== 'smoke' && plan.volume?.oneIterationModelsOneOperation !== true) {
    blockers.push(issue('blocker', 'WORKLOAD_MAPPING_UNCONFIRMED', 'The plan does not confirm that one k6 iteration models one unit of the volume calculation.', 'Set volume.oneIterationModelsOneOperation=true only after verifying the script-to-business-operation mapping.'));
  }

  const traffic = deriveTraffic(plan);
  if (traffic.baseline && traffic.observedPeak < traffic.baseline) {
    blockers.push(issue('blocker', 'TRAFFIC_PEAK_BELOW_BASELINE', `Observed/derived peak ${traffic.observedPeak} is lower than baseline ${traffic.baseline}.`, 'Correct the telemetry window or peak inputs before deriving headroom.'));
  }
  if (traffic.baseline && Number(traffic.headroomPercent) < 0) {
    blockers.push(issue('blocker', 'TRAFFIC_HEADROOM_INVALID', 'volume.headroomPercent cannot be negative.', 'Use zero when no headroom is required, or a positive agreed margin.'));
  }
  if (traffic.baseline && Number(traffic.explorationMultiplier) < 1) {
    blockers.push(issue('blocker', 'TRAFFIC_EXPLORATION_MULTIPLIER_INVALID', 'volume.explorationCeilingMultiplier must be at least 1.', 'Use a ceiling at or above design peak; the value is a safety bound, not a proven system limit.'));
  }
  if (scenario !== 'smoke' && !traffic.baseline) {
    blockers.push(issue('blocker', 'TRAFFIC_BASELINE_UNKNOWN', 'No baseline arrival rate can be derived.', 'Provide observedBaselineRate from APM/gateway/logs or activeUsers + operationsPerUser + observationWindowSeconds.'));
  }
  if (traffic.baselineSource === 'business_estimate') {
    warnings.push(issue('warning', 'TRAFFIC_ESTIMATED', 'Baseline is estimated from business volume rather than observed production telemetry.', 'Replace the estimate with gateway/APM/access-log throughput when available.'));
  }
  if (traffic.baseline && !isFinitePositive(plan.volume?.observedPeakRate)) {
    warnings.push(issue('warning', 'PEAK_ESTIMATED', 'Peak traffic is derived from peakFactor, not observed production data.', 'Measure busy-hour/peak telemetry and populate volume.observedPeakRate.'));
  }

  const env = plan.environment ?? {};
  const capacityView = capacity(env);
  let scaleRatio = 1;
  if (scenario !== 'smoke') {
    if (!capacityView.complete) {
      blockers.push(issue('blocker', 'ENV_CAPACITY_UNKNOWN', 'Production/test CPU, memory or replica capacity is incomplete.', 'Record replicas, CPU cores per replica and memory per replica for both environments.'));
    } else {
      const mode = env.comparisonMode ?? 'equivalent';
      const minimum = Number(env.minimumCapacityRatio ?? (mode === 'equivalent' ? 0.8 : 0.25));
      if (mode === 'scaled') {
        scaleRatio = capacityView.ratios.effective;
        notes.push(`Scaled environment: runtime arrival rates are multiplied by the effective capacity ratio ${scaleRatio}.`);
      } else if (mode !== 'equivalent') {
        blockers.push(issue('blocker', 'ENV_MODE_INVALID', `environment.comparisonMode=${mode} is unsupported.`, 'Use equivalent or scaled.'));
      }
      if (capacityView.ratios.effective < minimum) {
        blockers.push(issue('blocker', 'ENV_CAPACITY_BELOW_DECLARED_MINIMUM', `Test effective capacity ratio ${capacityView.ratios.effective} is below the declared minimum ${minimum}.`, 'Increase test capacity or intentionally lower environment.minimumCapacityRatio after documenting the tradeoff.'));
      }
      if (mode === 'equivalent' && capacityView.ratios.effective < 1) {
        warnings.push(issue('warning', 'ENV_NOT_FULL_PARITY', `Equivalent mode is declared, but effective test capacity is ${capacityView.ratios.effective} of production.`, 'Interpret absolute capacity claims cautiously or use scaled mode.'));
      }
    }
  }

  const config = env.configurationParity ?? {};
  for (const [field, label] of [['databaseTopologyEquivalent', 'database topology'], ['cacheTopologyEquivalent', 'cache topology'], ['networkPathEquivalent', 'network path'], ['autoscalingEquivalent', 'autoscaling policy']]) {
    if (scenario !== 'smoke' && config[field] !== true) {
      warnings.push(issue('warning', `PARITY_${field.toUpperCase()}`, `${label} is not confirmed equivalent.`, 'Document the difference because it can invalidate production extrapolation.'));
    }
  }

  const obs = plan.observability ?? {};
  if (scenario !== 'smoke') {
    if (obs.applicationMetrics !== true) blockers.push(issue('blocker', 'OBS_APP_METRICS_MISSING', 'Application metrics are not confirmed.', 'Instrument latency, throughput, errors and saturation before diagnostic load tests.'));
    if (obs.infrastructureMetrics !== true) blockers.push(issue('blocker', 'OBS_INFRA_METRICS_MISSING', 'Infrastructure metrics are not confirmed.', 'Capture CPU, memory, network, container/pod and scaling metrics.'));
    if (obs.logs !== true) blockers.push(issue('blocker', 'OBS_LOGS_MISSING', 'Application logs are not confirmed.', 'Ensure searchable logs correlate errors/timeouts with the test window.'));
    if (obs.traces !== true) warnings.push(issue('warning', 'OBS_TRACES_MISSING', 'Distributed traces are not confirmed.', 'Tracing materially improves bottleneck diagnosis, especially for tail latency.'));
    if (['stress', 'breakpoint', 'soak'].includes(scenario) && obs.dependencyMetrics !== true) {
      warnings.push(issue('warning', 'OBS_DEPENDENCIES_MISSING', 'Dependency metrics are not confirmed for a high-diagnostic-value scenario.', 'Capture DB/cache/queue/downstream latency, errors, pools and saturation.'));
    }
  }

  const scaledTraffic = traffic.baseline ? {
    baseline: round(traffic.baseline * scaleRatio),
    observedPeak: round(traffic.observedPeak * scaleRatio),
    designPeak: round(traffic.designPeak * scaleRatio),
    explorationCeiling: round(traffic.explorationCeiling * scaleRatio),
  } : { baseline: null, observedPeak: null, designPeak: null, explorationCeiling: null };
  const maxRate = maxRateForScenario(scenario, scaledTraffic);
  const safetyFactor = Number(plan.generator?.vuSafetyFactor ?? 1.5);
  if (!Number.isFinite(safetyFactor) || safetyFactor < 1) {
    blockers.push(issue('blocker', 'GENERATOR_SAFETY_FACTOR_INVALID', 'generator.vuSafetyFactor must be at least 1.', 'Use a factor of 1 or greater and recalibrate after a trial run.'));
  }
  const vus = estimatedVus(maxRate, nfr.p99Ms, safetyFactor);

  if (scenarioOverride && scenarioOverride !== 'auto' && scenarioOverride !== recommendedScenario) {
    notes.push(`Scenario override ${scenarioOverride} differs from objective recommendation ${recommendedScenario}.`);
  }
  notes.push('VU allocation is an initial estimate. Recalibrate with observed iteration duration, vus_max and dropped_iterations after a trial run.');

  const status = blockers.length ? 'BLOCKED' : warnings.length ? 'READY_WITH_WARNINGS' : 'READY';
  return {
    status,
    scenario,
    recommendedScenario,
    objective,
    blockers,
    warnings,
    notes,
    traffic: { production: traffic, runtime: scaledTraffic },
    environment: capacityView,
    generator: { ...vus, maxScenarioRate: round(maxRate || 1) },
  };
}

export function runtimeEnv(plan, assessment) {
  const nfr = plan.nfr ?? {};
  const traffic = assessment.traffic.runtime;
  return {
    TARGET_BASE_URL: String(plan.target?.baseUrl ?? 'http://127.0.0.1:3000'),
    SCENARIO: assessment.scenario,
    NFR_P95_MS: Number(nfr.p95Ms ?? 500),
    NFR_P99_MS: Number(nfr.p99Ms ?? 1000),
    ERROR_RATE_THRESHOLD: Number(nfr.errorRate ?? 0.01),
    CHECK_RATE_THRESHOLD: Number(nfr.checkRate ?? 0.99),
    APDEX_T_MS: Number(nfr.apdexTMs ?? nfr.p95Ms ?? 500),
    APDEX_MIN: Number(nfr.apdexMin ?? 0.85),
    BASELINE_RATE: Math.max(1, Math.ceil(traffic.baseline ?? 1)),
    PEAK_RATE: Math.max(1, Math.ceil(traffic.designPeak ?? traffic.observedPeak ?? traffic.baseline ?? 1)),
    LIMIT_RATE: Math.max(1, Math.ceil(traffic.explorationCeiling ?? traffic.designPeak ?? 1)),
    BASELINE_RPS: Math.max(1, Math.ceil(traffic.baseline ?? 1)),
    PEAK_RPS: Math.max(1, Math.ceil(traffic.designPeak ?? traffic.observedPeak ?? traffic.baseline ?? 1)),
    LIMIT_RPS: Math.max(1, Math.ceil(traffic.explorationCeiling ?? traffic.designPeak ?? 1)),
    PRE_ALLOCATED_VUS: assessment.generator.preAllocatedVUs,
    MAX_VUS: assessment.generator.maxVUs,
  };
}

export function renderMarkdown(plan, assessment, sourceFile) {
  const pct = (value) => Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : 'n/a';
  const t = assessment.traffic;
  const lines = [
    '# Performance Readiness Report', '',
    `- Plan: ${sourceFile}`,
    `- Status: **${assessment.status}**`,
    `- Objective: ${assessment.objective}`,
    `- Recommended scenario: **${assessment.recommendedScenario}**`,
    `- Selected scenario: **${assessment.scenario}**`, '',
    '## Traffic model', '',
    `- Baseline source: ${t.production.baselineSource}`,
    `- Production baseline: ${t.production.baseline ?? 'n/a'} iterations/s`,
    `- Observed/derived production peak: ${t.production.observedPeak ?? 'n/a'} iterations/s`,
    `- Design peak with headroom: ${t.production.designPeak ?? 'n/a'} iterations/s`,
    `- Breakpoint exploration ceiling (not a proven limit): ${t.production.explorationCeiling ?? 'n/a'} iterations/s`,
    `- Runtime baseline: ${t.runtime.baseline ?? 'n/a'} iterations/s`,
    `- Runtime design peak: ${t.runtime.designPeak ?? 'n/a'} iterations/s`, '',
    '## Environment capacity', '',
  ];
  if (assessment.environment.complete) {
    lines.push(
      `- Production: ${assessment.environment.production.totalCpuCores} CPU cores, ${assessment.environment.production.totalMemoryMb} MB, ${assessment.environment.production.replicas} replicas`,
      `- Test: ${assessment.environment.test.totalCpuCores} CPU cores, ${assessment.environment.test.totalMemoryMb} MB, ${assessment.environment.test.replicas} replicas`,
      `- CPU ratio: ${pct(assessment.environment.ratios.cpu)}`,
      `- Memory ratio: ${pct(assessment.environment.ratios.memory)}`,
      `- Effective scale ratio: ${pct(assessment.environment.ratios.effective)}`,
    );
  } else {
    lines.push('- Capacity comparison incomplete.');
  }
  lines.push('', '## Generator starting point', '',
    `- Maximum planned scenario rate: ${assessment.generator.maxScenarioRate} iterations/s`,
    `- preAllocatedVUs: ${assessment.generator.preAllocatedVUs}`,
    `- maxVUs: ${assessment.generator.maxVUs}`,
    `- VU safety factor: ${assessment.generator.safetyFactor}`, '',
    '## Blockers', '');
  if (!assessment.blockers.length) lines.push('- None');
  for (const item of assessment.blockers) lines.push(`- **${item.code}** — ${item.message} Recommendation: ${item.recommendation}`);
  lines.push('', '## Warnings', '');
  if (!assessment.warnings.length) lines.push('- None');
  for (const item of assessment.warnings) lines.push(`- **${item.code}** — ${item.message} Recommendation: ${item.recommendation}`);
  lines.push('', '## Notes', '');
  for (const item of assessment.notes) lines.push(`- ${item}`);
  lines.push('', '> READY means the declared prerequisites are internally consistent. It does not prove production equivalence or system capacity.');
  return lines.join('\n');
}
