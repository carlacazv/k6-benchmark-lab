import fs from 'node:fs';
import path from 'node:path';

const rank = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const issue = (severity, code, message, recommendation) => ({ severity, code, message, recommendation });

export function hydratePlanFromDiscovery(planInput, cwd = process.cwd()) {
  const plan = structuredClone(planInput);
  const volume = plan.volume ?? (plan.volume = {});
  const configuredPath = volume.discoveryProfile;
  const result = { configured: Boolean(configuredPath), loaded: false, path: configuredPath ?? null, profile: null, blockers: [], warnings: [], notes: [] };
  if (!configuredPath) return { plan, discovery: result };
  const resolved = path.isAbsolute(configuredPath) ? configuredPath : path.resolve(cwd, configuredPath);
  if (!fs.existsSync(resolved)) { result.missing = true; return { plan, discovery: result }; }
  let profile;
  try { profile = JSON.parse(fs.readFileSync(resolved, 'utf8')); }
  catch (error) {
    result.blockers.push(issue('blocker', 'DISCOVERY_PROFILE_INVALID', `Cannot parse discovery profile ${configuredPath}: ${error.message}`, 'Regenerate it with `mise run discover`.'));
    return { plan, discovery: result };
  }
  if (Number(profile.schemaVersion) !== 1) result.blockers.push(issue('blocker', 'DISCOVERY_SCHEMA_UNSUPPORTED', `Discovery profile schemaVersion=${profile.schemaVersion} is unsupported.`, 'Regenerate the profile with the current lab version.'));
  if (profile.unit && volume.unit && profile.unit !== volume.unit) result.blockers.push(issue('blocker', 'DISCOVERY_UNIT_MISMATCH', `Discovery unit ${profile.unit} does not match plan volume.unit ${volume.unit}.`, 'Align telemetry aggregation with the business operation modeled by one k6 iteration.'));
  const baseline = Number(profile.recommendation?.baselineRate);
  const peak = Number(profile.recommendation?.observedPeakRate);
  if (!(baseline > 0) || !(peak > 0)) result.blockers.push(issue('blocker', 'DISCOVERY_RATES_INVALID', 'Discovery profile does not contain positive baseline/peak recommendations.', 'Inspect telemetry quality and regenerate the profile.'));
  else { volume.observedBaselineRate = baseline; volume.observedPeakRate = peak; }
  const confidence = String(profile.quality?.confidence ?? 'LOW').toUpperCase();
  const minimum = String(volume.discoveryMinimumConfidence ?? 'MEDIUM').toUpperCase();
  if (!rank[confidence]) result.blockers.push(issue('blocker', 'DISCOVERY_CONFIDENCE_INVALID', `Unknown discovery confidence ${confidence}.`, 'Regenerate the profile.'));
  else if (!rank[minimum]) result.blockers.push(issue('blocker', 'DISCOVERY_MIN_CONFIDENCE_INVALID', `Unknown discoveryMinimumConfidence ${minimum}.`, 'Use LOW|MEDIUM|HIGH.'));
  else if (rank[confidence] < rank[minimum]) result.blockers.push(issue('blocker', 'DISCOVERY_CONFIDENCE_TOO_LOW', `Discovery confidence ${confidence} is below required ${minimum}.`, 'Improve telemetry coverage/window quality or intentionally lower the documented minimum.'));
  for (const warning of profile.quality?.warnings ?? []) result.warnings.push(issue('warning', 'DISCOVERY_DATA_QUALITY', warning, 'Review the discovery report before approving the workload model.'));
  const eventCount = profile.eventDetection?.events?.length ?? 0;
  if (eventCount > 0) result.notes.push(`${eventCount} exceptional telemetry interval(s) were detected and intentionally excluded from automatic peak selection; review their business context.`);
  result.notes.push(`Discovery profile ${configuredPath} supplied baseline=${baseline} and observedPeak=${peak} with ${confidence} confidence.`);
  result.loaded = true;
  result.profile = profile;
  return { plan, discovery: result };
}

export function applyDiscoveryPolicy(assessment, discovery, volume = {}) {
  if (assessment.scenario !== 'smoke' && volume.discoveryRequired === true && !discovery.loaded && !discovery.blockers.length) {
    discovery.blockers.push(issue('blocker', 'DISCOVERY_PROFILE_REQUIRED', `Required discovery profile ${discovery.path ?? 'is not configured'} is unavailable.`, 'Run `mise run discover` before non-smoke execution or explicitly change the plan policy.'));
  }
  assessment.blockers.push(...discovery.blockers);
  assessment.warnings.push(...discovery.warnings);
  assessment.notes.push(...discovery.notes);
  assessment.status = assessment.blockers.length ? 'BLOCKED' : assessment.warnings.length ? 'READY_WITH_WARNINGS' : 'READY';
  return assessment;
}

export function renderDiscoveryReadinessSection(discovery) {
  const lines = ['', '## Telemetry discovery', ''];
  if (!discovery.configured) return `${lines.join('\n')}- Not configured.\n`;
  if (!discovery.loaded) return `${lines.join('\n')}- Profile: ${discovery.path}\n- Loaded: no\n`;
  lines.push(`- Profile: ${discovery.path}`, '- Loaded: yes', `- Source: ${discovery.profile.source?.type ?? 'unknown'}`, `- Confidence: ${discovery.profile.quality?.confidence ?? 'unknown'}`, `- Discovered baseline: ${discovery.profile.recommendation?.baselineRate ?? 'n/a'} ops/s`, `- Discovered peak: ${discovery.profile.recommendation?.observedPeakRate ?? 'n/a'} ops/s`, `- Exceptional intervals: ${discovery.profile.eventDetection?.events?.length ?? 0}`, '');
  return lines.join('\n');
}
