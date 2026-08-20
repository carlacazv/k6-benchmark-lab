import fs from 'node:fs';
import path from 'node:path';
import { parseSimpleYaml } from './lib/simple-yaml.mjs';

const root = process.cwd();
const failures = [];
const checks = [];

function ok(name, detail = '') {
  checks.push({ name, detail });
}

function fail(name, detail) {
  failures.push({ name, detail });
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertRequiredFiles() {
  const required = [
    'README.md',
    'LICENSE',
    'NOTICE',
    'CONTRIBUTING.md',
    'ROADMAP.md',
    'CHANGELOG.md',
    'docs/00-start-here.md',
    'docs/17-qa-performance-playbook.md',
    'docs/18-scenario-decision-tree.md',
    'docs/19-end-to-end-walkthrough.md',
    'docs/20-troubleshooting.md',
    'docs/21-v1-release-guide.md',
    'templates/performance-test-plan.yaml',
    'templates/telemetry-discovery.yaml',
    'templates/telemetry-correlation.yaml',
    'templates/experiment.yaml',
  ];
  const missing = required.filter((file) => !exists(file));
  if (missing.length) fail('required public files', `missing: ${missing.join(', ')}`);
  else ok('required public files', `${required.length} files present`);
}

function assertPackageVersionAndLicense() {
  const pkg = JSON.parse(read('package.json'));
  if (pkg.version !== '1.0.0') fail('release version', `package.json version is ${pkg.version}; expected 1.0.0`);
  else ok('release version', '1.0.0');

  if (pkg.license !== 'Apache-2.0') fail('package license', `package.json license is ${pkg.license ?? 'missing'}; expected Apache-2.0`);
  else ok('package license', 'Apache-2.0');
}

function assertLicenseFiles() {
  const license = read('LICENSE');
  const notice = read('NOTICE');
  const licenseMarkers = [
    'Apache License',
    'Version 2.0, January 2004',
    'TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION',
    'Grant of Patent License',
    'END OF TERMS AND CONDITIONS',
  ];
  const missingLicenseMarkers = licenseMarkers.filter((marker) => !license.includes(marker));
  if (missingLicenseMarkers.length) fail('Apache-2.0 license text', `missing markers: ${missingLicenseMarkers.join(', ')}`);
  else ok('Apache-2.0 license text', 'full license markers present');

  const noticeMarkers = ['k6 Benchmark Lab', 'Copyright 2026 Carla Cury Azevedo', 'Apache License, Version 2.0'];
  const missingNoticeMarkers = noticeMarkers.filter((marker) => !notice.includes(marker));
  if (missingNoticeMarkers.length) fail('NOTICE attribution', `missing markers: ${missingNoticeMarkers.join(', ')}`);
  else ok('NOTICE attribution', 'project attribution present');
}

function markdownFiles() {
  const files = ['README.md', 'CONTRIBUTING.md', 'ROADMAP.md', 'CHANGELOG.md'];
  const docsDir = path.join(root, 'docs');
  if (fs.existsSync(docsDir)) {
    for (const entry of fs.readdirSync(docsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) files.push(path.join('docs', entry.name));
    }
  }
  return files;
}

function normalizeLinkTarget(rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
  const titleIndex = target.search(/\s+["']/);
  if (titleIndex >= 0) target = target.slice(0, titleIndex);
  return target;
}

function assertMarkdownLinks() {
  const broken = [];
  let checked = 0;
  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const relativeFile of markdownFiles()) {
    const text = read(relativeFile);
    for (const match of text.matchAll(linkPattern)) {
      const target = normalizeLinkTarget(match[1]);
      if (!target || target.startsWith('#') || /^(https?:|mailto:|data:)/i.test(target)) continue;
      const withoutAnchor = target.split('#')[0].split('?')[0];
      if (!withoutAnchor) continue;
      checked += 1;
      const decoded = decodeURIComponent(withoutAnchor);
      const resolved = path.resolve(root, path.dirname(relativeFile), decoded);
      if (!resolved.startsWith(root)) {
        broken.push(`${relativeFile} -> ${target} (escapes repository root)`);
        continue;
      }
      if (!fs.existsSync(resolved)) broken.push(`${relativeFile} -> ${target}`);
    }
  }
  if (broken.length) fail('local Markdown links', broken.join('; '));
  else ok('local Markdown links', `${checked} local links resolved`);
}

function get(obj, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => value?.[key], obj);
}

function assertTemplate(file, requiredPaths) {
  try {
    const parsed = parseSimpleYaml(read(file));
    const missing = requiredPaths.filter((requiredPath) => get(parsed, requiredPath) === undefined);
    if (missing.length) fail(`template ${file}`, `missing keys: ${missing.join(', ')}`);
    else ok(`template ${file}`, 'YAML parsed and required keys exist');
  } catch (error) {
    fail(`template ${file}`, error.message);
  }
}

function assertTemplates() {
  assertTemplate('templates/performance-test-plan.yaml', [
    'target.baseUrl',
    'target.authorized',
    'objective.type',
    'volume.unit',
    'environment.production',
    'environment.test',
    'observability.applicationMetrics',
    'nfr.p95Ms',
    'nfr.p99Ms',
  ]);
  assertTemplate('templates/telemetry-discovery.yaml', [
    'unit',
    'source.type',
    'window.days',
    'analysis.baselinePercentile',
    'analysis.peakPercentile',
  ]);
  assertTemplate('templates/telemetry-correlation.yaml', [
    'source.type',
    'analysis.minimumMatchedBuckets',
    'analysis.strongCorrelation',
    'signals.cpu.role',
    'signals.dependencyLatency.role',
  ]);
  assertTemplate('templates/experiment.yaml', [
    'experiment.hypothesis',
    'experiment.intervention.variable',
    'experiment.workload.vus',
    'experiment.expected.metric',
    'experiment.safety.target',
  ]);
}

function assertProductLanguage() {
  const readme = read('README.md');
  const requiredPhrases = [
    'docs/00-start-here.md',
    'docs/17-qa-performance-playbook.md',
    'docs/18-scenario-decision-tree.md',
    'templates/',
    'Correlation is not causation',
    'smoke',
    'Apache License, Version 2.0',
    'Apache-2.0',
    '[LICENSE](LICENSE)',
    '[NOTICE](NOTICE)',
  ];
  const missing = requiredPhrases.filter((phrase) => !readme.includes(phrase));
  if (missing.length) fail('README product contract', `missing: ${missing.join(', ')}`);
  else ok('README product contract', 'onboarding, templates, safety and license language present');
}

assertRequiredFiles();
assertPackageVersionAndLicense();
assertLicenseFiles();
assertMarkdownLinks();
assertTemplates();
assertProductLanguage();

console.log('# v1 Release QC');
for (const check of checks) console.log(`PASS  ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
for (const failure of failures) console.error(`FAIL  ${failure.name} — ${failure.detail}`);

if (failures.length) {
  console.error(`\nRelease QC failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log(`\nRelease QC passed: ${checks.length} checks.`);
