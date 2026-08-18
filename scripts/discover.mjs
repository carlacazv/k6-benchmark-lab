import fs from 'node:fs';
import path from 'node:path';
import { parseSimpleYaml } from './lib/simple-yaml.mjs';
import { buildWorkloadProfile, planVolumeSuggestion, renderWorkloadProfileMarkdown } from './lib/telemetry-core.mjs';
import { loadFileSeries } from './telemetry/adapters/file.mjs';
import { loadAccessLogSeries } from './telemetry/adapters/access-log.mjs';
import { loadPrometheusSeries } from './telemetry/adapters/prometheus.mjs';
import { loadDatadogSeries } from './telemetry/adapters/datadog.mjs';
import { loadSyntheticSeries } from './telemetry/adapters/synthetic.mjs';

const args = process.argv.slice(2);
const configFile = args.find((arg) => !arg.startsWith('--')) ?? process.env.TELEMETRY_DISCOVERY_CONFIG ?? 'telemetry-discovery.yaml';
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex >= 0 ? args[outIndex + 1] : 'artifacts/discovery';
if (!fs.existsSync(configFile)) { console.error(`Telemetry discovery config not found: ${configFile}`); process.exit(2); }
let config;
try { config = parseSimpleYaml(fs.readFileSync(configFile, 'utf8')); }
catch (error) { console.error(`Invalid telemetry discovery config: ${error.message}`); process.exit(2); }
const loaders = { file: loadFileSeries, 'access-log': loadAccessLogSeries, prometheus: loadPrometheusSeries, datadog: loadDatadogSeries, synthetic: loadSyntheticSeries };
const sourceType = config.source?.type;
const loader = loaders[sourceType];
if (!loader) { console.error(`Unsupported telemetry source.type=${sourceType}. Use file|access-log|prometheus|datadog|synthetic.`); process.exit(2); }
try {
  const loaded = await loader(config.source, config);
  const profile = buildWorkloadProfile(loaded.samples, config, loaded.provenance);
  if (loaded.provenance.synthetic === true && !profile.quality.warnings.some((warning) => warning.includes('synthetic'))) profile.quality.warnings.push('Source is synthetic; do not treat its rates as production evidence.');
  fs.mkdirSync(outDir, { recursive: true });
  const profilePath = path.join(outDir, 'workload-profile.json');
  fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  fs.writeFileSync(path.join(outDir, 'workload-profile.md'), renderWorkloadProfileMarkdown(profile, configFile));
  fs.writeFileSync(path.join(outDir, 'plan-volume-suggestion.yaml'), planVolumeSuggestion(profile, profilePath));
  console.log(`Telemetry discovery: ${profile.quality.confidence} confidence`);
  console.log(`Baseline p${profile.recommendation.baselinePercentile}: ${profile.recommendation.baselineRate} ops/s`);
  console.log(`Observed peak p${profile.recommendation.peakPercentile}: ${profile.recommendation.observedPeakRate} ops/s`);
  console.log(`Exceptional intervals: ${profile.eventDetection.events.length}`);
  console.log(`Wrote ${outDir}/workload-profile.{json,md} and plan-volume-suggestion.yaml`);
  if (profile.quality.confidence === 'LOW') process.exitCode = 1;
} catch (error) {
  console.error(`Telemetry discovery failed: ${error.message}`);
  process.exit(1);
}
