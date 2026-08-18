import fs from 'node:fs';
import path from 'node:path';
import { parseSimpleYaml } from './lib/simple-yaml.mjs';
import { assessPlan, renderMarkdown, runtimeEnv } from './lib/readiness-core.mjs';
import { applyDiscoveryPolicy, hydratePlanFromDiscovery, renderDiscoveryReadinessSection } from './lib/discovery-readiness.mjs';

const args = process.argv.slice(2);
const planFile = args.find((arg) => !arg.startsWith('--')) ?? process.env.PERFORMANCE_PLAN ?? 'performance-test-plan.yaml';
const scenarioIndex = args.indexOf('--scenario');
const outIndex = args.indexOf('--out-dir');
const scenario = scenarioIndex >= 0 ? args[scenarioIndex + 1] : process.env.SCENARIO_OVERRIDE ?? 'auto';
const outDir = outIndex >= 0 ? args[outIndex + 1] : 'artifacts/readiness';
if (!fs.existsSync(planFile)) { console.error(`Performance plan not found: ${planFile}`); process.exit(2); }
let parsedPlan;
try { parsedPlan = parseSimpleYaml(fs.readFileSync(planFile, 'utf8')); }
catch (error) { console.error(`Invalid performance plan: ${error.message}`); process.exit(2); }
const { plan, discovery } = hydratePlanFromDiscovery(parsedPlan, process.cwd());
const assessment = applyDiscoveryPolicy(assessPlan(plan, scenario), discovery, plan.volume ?? {});
const env = runtimeEnv(plan, assessment);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'readiness.json'), JSON.stringify({ source: planFile, discovery: { configured: discovery.configured, loaded: discovery.loaded, path: discovery.path, profile: discovery.profile }, assessment, runtimeEnv: env }, null, 2));
fs.writeFileSync(path.join(outDir, 'readiness-report.md'), `${renderMarkdown(plan, assessment, planFile)}${renderDiscoveryReadinessSection(discovery)}`);
fs.writeFileSync(path.join(outDir, 'runtime.env'), `${Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
console.log(`Performance readiness: ${assessment.status}`);
console.log(`Recommended scenario: ${assessment.recommendedScenario}; selected: ${assessment.scenario}`);
if (discovery.configured) console.log(`Telemetry discovery profile: ${discovery.loaded ? 'loaded' : 'not loaded'} (${discovery.path})`);
console.log(`Read ${planFile}; wrote ${outDir}/readiness-report.md, readiness.json and runtime.env`);
if (assessment.blockers.length) {
  for (const blocker of assessment.blockers) console.error(`BLOCKER ${blocker.code}: ${blocker.message}`);
  process.exit(1);
}
