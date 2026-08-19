const interventionRole = {
  LAB_DEPENDENCY_LATENCY_MS: 'dependency_latency_ms',
  LAB_DB_WAIT_MS: 'db_wait_ms',
  LAB_CPU_BURN_MS: 'cpu_utilization',
};

export function expectedRoleForIntervention(variable) {
  return interventionRole[variable] ?? null;
}

export function buildEvidenceChain(correlation, experiment) {
  const variable = experiment?.experiment?.intervention?.variable ?? null;
  const expectedRole = expectedRoleForIntervention(variable);
  const experimentStatus = experiment?.result?.status ?? 'UNKNOWN';
  const realRuns = (correlation?.runs ?? []).filter((run) =>
    run?.source?.type === 'prometheus' && run?.source?.synthetic !== true && run?.quality?.inferenceAllowed === true);
  const hypotheses = realRuns.flatMap((run) => (run.hypotheses ?? []).map((hypothesis) => ({
    ...hypothesis,
    protocol: run.run?.protocol ?? null,
  })));
  const matching = expectedRole ? hypotheses.filter((hypothesis) => hypothesis.role === expectedRole) : [];
  const strongest = (correlation?.runs ?? []).flatMap((run) => run.strongestLatencyCorrelations ?? [])
    .filter((row) => row.latencyR !== null && row.latencyR !== undefined)
    .sort((a, b) => Math.abs(Number(b.latencyR)) - Math.abs(Number(a.latencyR)))[0] ?? null;

  let status = 'PARTIAL';
  if (realRuns.length && expectedRole && matching.length && experimentStatus === 'SUPPORTED') status = 'ALIGNED';
  else if (experimentStatus === 'SUPPORTED' && realRuns.length && expectedRole && !matching.length) status = 'MISMATCH';

  return {
    schemaVersion: 1,
    status,
    evidenceLadder: ['observation', 'correlation', 'hypothesis', 'controlled_experiment'],
    intervention: { variable, expectedRole },
    correlation: {
      realPrometheusRuns: realRuns.length,
      matchingHypotheses: matching,
      strongestLatencyCorrelation: strongest,
      causalityStatus: correlation?.causalityStatus ?? 'hypotheses_only_not_causal_proof',
    },
    experiment: {
      id: experiment?.experiment?.id ?? null,
      status: experimentStatus,
      consistency: experiment?.result?.consistency ?? null,
    },
    interpretation: status === 'ALIGNED'
      ? 'Real Prometheus telemetry produced a hypothesis for the same technical role that a separate controlled experiment supported in the owned lab.'
      : status === 'MISMATCH'
        ? 'The controlled experiment supported the intervention, but real telemetry correlation did not produce a matching hypothesis.'
        : 'The evidence chain is incomplete or inconclusive; do not promote it to a causal claim.',
    caveat: 'Alignment strengthens causal evidence inside this controlled lab, but it does not prove production causality or external validity.',
  };
}
