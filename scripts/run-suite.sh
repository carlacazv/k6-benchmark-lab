#!/usr/bin/env bash
set -uo pipefail
scenario="${1:-smoke}"
mkdir -p artifacts/rest artifacts/graphql artifacts/browser
status=0
SCENARIO="$scenario" K6_REPORT_DIR=artifacts/rest k6 run tests/rest/performance.js || status=1
SCENARIO="$scenario" K6_REPORT_DIR=artifacts/graphql k6 run tests/graphql/performance.js || status=1
SCENARIO="$scenario" K6_REPORT_DIR=artifacts/browser k6 run tests/browser/performance.js || status=1
node scripts/analyze-results.mjs artifacts artifacts/performance-diagnosis.md artifacts/performance-diagnosis.json || status=1
exit "$status"
