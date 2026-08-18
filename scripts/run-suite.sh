#!/usr/bin/env bash
set -uo pipefail
requested_scenario="${1:-auto}"
plan="${PERFORMANCE_PLAN:-performance-test-plan.yaml}"
readiness_dir="artifacts/readiness"

mkdir -p "$readiness_dir" artifacts/rest artifacts/graphql artifacts/browser
node scripts/readiness.mjs "$plan" --scenario "$requested_scenario" --out-dir "$readiness_dir" || exit 1
set -a
# shellcheck disable=SC1091
source "$readiness_dir/runtime.env"
set +a

status=0
K6_REPORT_DIR=artifacts/rest k6 run tests/rest/performance.js || status=1
K6_REPORT_DIR=artifacts/graphql k6 run tests/graphql/performance.js || status=1
K6_REPORT_DIR=artifacts/browser k6 run tests/browser/performance.js || status=1
node scripts/analyze-results.mjs artifacts artifacts/performance-diagnosis.md artifacts/performance-diagnosis.json || status=1
exit "$status"
