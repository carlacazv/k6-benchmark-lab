import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseSimpleYaml } from './lib/simple-yaml.mjs';
import { assessPlan, runtimeEnv } from './lib/readiness-core.mjs';

const planText = fs.readFileSync('performance-test-plan.yaml', 'utf8');
const plan = parseSimpleYaml(planText);
const assessment = assessPlan(plan, 'auto');
if (assessment.status === 'BLOCKED') throw new Error(JSON.stringify(assessment.blockers));
if (assessment.recommendedScenario !== 'load') throw new Error('Expected load recommendation');
if (assessment.traffic.production.baseline !== 5) throw new Error(`Expected baseline 5, got ${assessment.traffic.production.baseline}`);
if (assessment.traffic.production.designPeak !== 18.75) throw new Error('Expected 25% headroom over observed peak');
const env = runtimeEnv(plan, assessment);
if (env.PEAK_RATE !== 19 || env.LIMIT_RATE !== 75) throw new Error(`Unexpected runtime rates: ${JSON.stringify(env)}`);

const blocked = structuredClone(plan);
blocked.target.authorized = false;
const blockedAssessment = assessPlan(blocked, 'load');
if (blockedAssessment.status !== 'BLOCKED' || !blockedAssessment.blockers.some((item) => item.code === 'TARGET_NOT_AUTHORIZED')) {
  throw new Error('Authorization blocker was not enforced');
}

const invalidCheckRate = structuredClone(plan);
invalidCheckRate.nfr.checkRate = 1.1;
if (!assessPlan(invalidCheckRate, 'load').blockers.some((item) => item.code === 'NFR_CHECK_RATE_INVALID')) {
  throw new Error('Invalid check rate was not blocked');
}

const invalidTraffic = structuredClone(plan);
invalidTraffic.volume.observedBaselineRate = 20;
invalidTraffic.volume.observedPeakRate = 10;
if (!assessPlan(invalidTraffic, 'load').blockers.some((item) => item.code === 'TRAFFIC_PEAK_BELOW_BASELINE')) {
  throw new Error('Peak below baseline was not blocked');
}

const scaled = parseSimpleYaml(fs.readFileSync('examples/scaled-performance-test-plan.yaml', 'utf8'));
const scaledAssessment = assessPlan(scaled, 'breakpoint');
if (scaledAssessment.status === 'BLOCKED') throw new Error(JSON.stringify(scaledAssessment.blockers));
if (scaledAssessment.environment.ratios.effective !== 0.25) throw new Error('Expected 25% capacity ratio');
if (scaledAssessment.traffic.runtime.designPeak !== 71.5) throw new Error(`Unexpected scaled peak ${scaledAssessment.traffic.runtime.designPeak}`);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'readiness-cli-'));
const run = spawnSync(process.execPath, ['scripts/readiness.mjs', 'performance-test-plan.yaml', '--scenario', 'smoke', '--out-dir', temp], { encoding: 'utf8' });
if (run.status !== 0) throw new Error(run.stderr || run.stdout);
for (const file of ['readiness.json', 'readiness-report.md', 'runtime.env']) {
  if (!fs.existsSync(path.join(temp, file))) throw new Error(`Missing ${file}`);
}
console.log('readiness tests passed');
