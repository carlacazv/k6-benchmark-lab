#!/usr/bin/env bash
set -euo pipefail

TARGET_SOURCE="${1:-/tmp/planning-poker}"
IMAGE="planning-poker-perf:${GITHUB_RUN_ID:-local}"
ARTIFACT_ROOT="artifacts/use-cases/planning-poker"
TARGET_BASE_URL="${TARGET_BASE_URL:-http://127.0.0.1:3000}"

if [[ ! -d "$TARGET_SOURCE" ]]; then
  echo "Planning Poker source directory not found: $TARGET_SOURCE" >&2
  exit 2
fi

mkdir -p "$ARTIFACT_ROOT"

echo "Building pinned Planning Poker target image once for the realtime scenario suite..."
docker build -t "$IMAGE" -f - "$TARGET_SOURCE" <<'DOCKERFILE'
FROM node:26-bookworm
WORKDIR /app
COPY . .
RUN npm ci \
 && npm run prisma:generate -w server \
 && npm run build
ENV PORT=3000
ENV HOST=0.0.0.0
ENV LOG_LEVEL=warn
ENV DATABASE_URL=file:/tmp/planning-poker.db
CMD ["bash", "-lc", "npm run prisma:migrate -w server && npm start"]
DOCKERFILE

current_container=""
cleanup() {
  if [[ -n "$current_container" ]]; then
    docker rm -f "$current_container" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

scenario_config() {
  case "$1" in
    baseline) echo "1 5 0" ;;
    load) echo "4 5 10000" ;;
    stress) echo "10 5 15000" ;;
    spike) echo "20 5 1000" ;;
    *) echo "Unknown Planning Poker scenario: $1" >&2; return 2 ;;
  esac
}

suite_status=0
status_file="$ARTIFACT_ROOT/realtime-status.tsv"
printf 'scenario\trooms\tparticipants_per_room\tvus\tarrival_window_ms\tk6_exit_code\n' > "$status_file"

for scenario in baseline load stress spike; do
  read -r rooms participants arrival_window_ms <<<"$(scenario_config "$scenario")"
  vus=$((rooms * participants))
  out_dir="$ARTIFACT_ROOT/$scenario"
  container_dir="$out_dir/container"
  current_container="planning-poker-${scenario}-${GITHUB_RUN_ID:-local}"

  mkdir -p "$container_dir"
  echo
  echo "=== Planning Poker $scenario: $rooms rooms x $participants participants = $vus VUs ==="

  docker run -d \
    --name "$current_container" \
    -p 3000:3000 \
    -e DATABASE_URL=file:/tmp/planning-poker.db \
    "$IMAGE" >/dev/null

  ready=0
  for _ in {1..120}; do
    if curl -fsS "$TARGET_BASE_URL/api/health" >/dev/null; then
      ready=1
      break
    fi
    if ! docker inspect -f '{{.State.Running}}' "$current_container" 2>/dev/null | grep -q true; then
      break
    fi
    sleep 1
  done

  if [[ "$ready" -ne 1 ]]; then
    echo "Target did not become ready for $scenario." >&2
    docker logs "$current_container" > "$container_dir/stdout.log" 2>&1 || true
    docker inspect "$current_container" > "$container_dir/inspect.json" 2>/dev/null || true
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$scenario" "$rooms" "$participants" "$vus" "$arrival_window_ms" "target-not-ready" >> "$status_file"
    docker rm -f "$current_container" >/dev/null 2>&1 || true
    current_container=""
    suite_status=1
    continue
  fi

  set +e
  PP_SCENARIO="$scenario" \
  SCENARIO="$scenario" \
  ROOMS="$rooms" \
  PARTICIPANTS_PER_ROOM="$participants" \
  ARRIVAL_WINDOW_MS="$arrival_window_ms" \
  TARGET_BASE_URL="$TARGET_BASE_URL" \
  K6_REPORT_DIR="$out_dir" \
    node scripts/run-k6-with-window.mjs \
      use-cases/planning-poker/socketio-workload.js \
      "$out_dir" \
      socketio
  k6_exit=$?
  set -e

  docker stats --no-stream "$current_container" > "$container_dir/stats.txt" 2>&1 || true
  docker logs "$current_container" > "$container_dir/stdout.log" 2>&1 || true
  docker inspect "$current_container" > "$container_dir/inspect.json" 2>/dev/null || true

  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$scenario" "$rooms" "$participants" "$vus" "$arrival_window_ms" "$k6_exit" >> "$status_file"

  # A performance threshold violation is evidence, not a CI infrastructure failure in this
  # synthetic architecture experiment. Missing reports are handled by the workflow quality gate.
  if [[ "$k6_exit" -ne 0 ]]; then
    echo "Scenario $scenario completed with k6 exit code $k6_exit; preserving the result as performance evidence."
  fi

  docker rm -f "$current_container" >/dev/null 2>&1 || true
  current_container=""
done

exit "$suite_status"
