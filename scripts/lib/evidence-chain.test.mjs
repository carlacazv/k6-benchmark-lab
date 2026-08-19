import assert from 'node:assert/strict';
import { buildEvidenceChain } from './evidence-chain.mjs';

const correlation = {
  causalityStatus: 'hypotheses_only_not_causal_proof',
  runs: [{
    run: { protocol: 'observability' },
    source: { type: 'prometheus', synthetic: false },
    quality: { inferenceAllowed: true },
    hypotheses: [{ role: 'dependency_latency_ms', signal: 'dependencyLatency', statement: 'dependency tracks latency' }],
    strongestLatencyCorrelations: [{ signal: 'dependencyLatency', latencyR: 0.97, matchedBuckets: 22 }],
  }],
};
const experiment = {
  experiment: { id: 'dependency-latency', intervention: { variable: 'LAB_DEPENDENCY_LATENCY_MS' } },
  result: { status: 'SUPPORTED', consistency: 1 },
};

const aligned = buildEvidenceChain(correlation, experiment);
assert.equal(aligned.status, 'ALIGNED');
assert.equal(aligned.intervention.expectedRole, 'dependency_latency_ms');
assert.equal(aligned.correlation.matchingHypotheses.length, 1);

const synthetic = structuredClone(correlation);
synthetic.runs[0].source.synthetic = true;
synthetic.runs[0].quality.inferenceAllowed = false;
assert.equal(buildEvidenceChain(synthetic, experiment).status, 'PARTIAL', 'synthetic telemetry can never complete the chain');

const wrong = structuredClone(correlation);
wrong.runs[0].hypotheses = [{ role: 'cpu_utilization', signal: 'cpu', statement: 'cpu' }];
assert.equal(buildEvidenceChain(wrong, experiment).status, 'MISMATCH');

console.log('evidence-chain tests passed');
