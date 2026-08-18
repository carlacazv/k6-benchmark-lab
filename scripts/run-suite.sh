#!/usr/bin/env bash
set -uo pipefail
requested_scenario="${1:-auto}"
plan="${PERFORMANCE_PLAN:-performance-test-plan.yaml}"
discovery_config="${TELEMETRY_DISCOVERY_CONFIG:-telemetry-discovery.yaml}"
correlation_config="${TELEMETRY_CORRELATION_CONFIG:-telemetry-correlation.yaml}"
readiness_dir="artifacts/readiness"
discovery_dir="artifacts/discovery"

mkdir -p "$readiness_dir" "$discovery_dir" artifacts/rest artifacts/graphql artifacts/browser artifacts/correlation

if [[ "${RUN_TELEMETRY_DISCOVERY:-1}" == "1" ]]; then
  node scripts/discover.mjs "$discovery_config" --out-dir "$discovery_dir" || exit 1
fi

node scripts/readiness.mjs "$plan" --scenario "$requested_scenario" --out-dir "$readiness_dir" || exit 1
set -a
# shellcheck disable=SC1091
source "$readiness_dir/runtime.env"
set +a

status=0
node scripts/run-k6-with-window.mjs tests/rest/performance.js artifacts/rest rest || status=1
node scripts/run-k6-with-window.mjs tests/graphql/performance.js artifacts/graphql graphql || status=1
K6_BROWSER_HEADLESS="${K6_BROWSER_HEADLESS:-true}" node scripts/run-k6-with-window.mjs tests/browser/performance.js artifacts/browser browser || status=1

node scripts/correlate.mjs "$correlation_config" --artifacts artifacts --out-dir artifacts/correlation || status=1
node scripts/analyze-results.mjs artifacts artifacts/performance-diagnosis.md artifacts/performance-diagnosis.json || status=1
exit "$status"
