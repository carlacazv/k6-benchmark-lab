import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'k6-window-test-'));
const bin = path.join(temp, 'bin');
const out = path.join(temp, 'artifacts');
fs.mkdirSync(bin, { recursive: true });
const fakeK6 = path.join(bin, 'k6');
fs.writeFileSync(fakeK6, `#!/usr/bin/env bash
set -e
out=""
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--out" ]]; then
    shift
    out="$1"
  fi
  shift || true
done
file="\${out#json=}"
mkdir -p "$(dirname "$file")"
echo '{"type":"Point","data":{"time":"2026-08-18T12:00:00Z","value":1,"tags":{}},"metric":"iterations"}' > "$file"
exit 0
`);
fs.chmodSync(fakeK6, 0o755);

const run = spawnSync(process.execPath, ['scripts/run-k6-with-window.mjs', 'tests/rest/performance.js', out, 'rest'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SCENARIO: 'load', TARGET_BASE_URL: 'http://target.example' },
});
if (run.status !== 0) throw new Error(run.stderr || run.stdout);
const window = JSON.parse(fs.readFileSync(path.join(out, 'test-window.json'), 'utf8'));
if (window.protocol !== 'rest' || window.scenario !== 'load' || window.target !== 'http://target.example') throw new Error(`Unexpected window metadata: ${JSON.stringify(window)}`);
if (!window.startedAt || !window.endedAt || window.exitCode !== 0) throw new Error('Window timestamps/exit code missing.');
if (!fs.existsSync(path.join(out, 'timeseries.json'))) throw new Error('Granular k6 output was not preserved.');
console.log('k6 window wrapper tests passed');
