import fs from 'node:fs';
import path from 'node:path';
import { buildEvidenceChain } from './lib/evidence-chain.mjs';

const args = process.argv.slice(2);
const correlationPath = args[0] || 'artifacts/observability/correlation/telemetry-correlation.json';
const experimentPath = args[1] || 'artifacts/experiments/default/experiment-report.json';
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex >= 0 ? args[outIndex + 1] : 'artifacts/observability';
const requireAligned = args.includes('--require-aligned');

function markdown(report) {
  const lines = [
    '# Real Observability Evidence Chain',
    '',
    `- Status: **${report.status}**`,
    `- Intervention: \`${report.intervention.variable ?? 'n/a'}\``,
    `- Expected telemetry role: **${report.intervention.expectedRole ?? 'n/a'}**`,
    `- Real Prometheus runs eligible for inference: **${report.correlation.realPrometheusRuns}**`,
    `- Matching telemetry hypotheses: **${report.correlation.matchingHypotheses.length}**`,
    `- Controlled experiment: **${report.experiment.status}**`,
    `- Experiment consistency: ${report.experiment.consistency === null ? 'n/a' : `${(Number(report.experiment.consistency) * 100).toFixed(1)}%`}`,
    '',
    '## Evidence ladder',
    '',
    report.evidenceLadder.map((step) => `**${step}**`).join(' → '),
    '',
    '## Interpretation',
    '',
    report.interpretation,
    '',
    `> ${report.caveat}`,
    '',
  ];
  if (report.correlation.strongestLatencyCorrelation) {
    const strongest = report.correlation.strongestLatencyCorrelation;
    lines.push('## Strongest latency correlation', '', `- ${strongest.signal}: r=${strongest.latencyR}, matched buckets=${strongest.matchedBuckets}`, '');
  }
  if (report.correlation.matchingHypotheses.length) {
    lines.push('## Matching hypothesis', '');
    for (const hypothesis of report.correlation.matchingHypotheses) {
      lines.push(`- **${hypothesis.statement}**`, `  - signal: ${hypothesis.signal}`, `  - confidence: ${hypothesis.confidence ?? 'n/a'}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

try {
  const correlation = JSON.parse(fs.readFileSync(correlationPath, 'utf8'));
  const experiment = JSON.parse(fs.readFileSync(experimentPath, 'utf8'));
  const report = { generatedAt: new Date().toISOString(), ...buildEvidenceChain(correlation, experiment) };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'evidence-chain.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'evidence-chain.md'), markdown(report));
  console.log(`[evidence-chain] ${report.status}: ${report.interpretation}`);
  if (requireAligned && report.status !== 'ALIGNED') process.exitCode = 2;
} catch (error) {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
}
