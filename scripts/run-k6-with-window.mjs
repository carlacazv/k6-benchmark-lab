import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [script, outDir, protocolArg] = process.argv.slice(2);
if (!script || !outDir) {
  console.error('Usage: node scripts/run-k6-with-window.mjs <script.js> <artifact-dir> [protocol]');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
const protocol = protocolArg ?? (script.includes('/graphql/') ? 'graphql' : script.includes('/browser/') ? 'browser' : script.includes('/rest/') ? 'rest' : 'unknown');
const startedAt = new Date().toISOString();
const startMs = Date.now();
const timeseriesFile = path.join(outDir, 'timeseries.json');
if (fs.existsSync(timeseriesFile)) fs.rmSync(timeseriesFile);
const result = spawnSync('k6', ['run', '--out', `json=${timeseriesFile}`, script], {
  stdio: 'inherit',
  env: { ...process.env, K6_REPORT_DIR: outDir },
});
const endedAt = new Date().toISOString();
const window = {
  schemaVersion: 1,
  protocol,
  scenario: process.env.SCENARIO ?? 'smoke',
  target: process.env.TARGET_BASE_URL ?? 'n/a',
  startedAt,
  endedAt,
  durationMs: Date.now() - startMs,
  exitCode: result.status ?? 1,
  granularOutput: timeseriesFile,
};
fs.writeFileSync(path.join(outDir, 'test-window.json'), JSON.stringify(window, null, 2));
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
