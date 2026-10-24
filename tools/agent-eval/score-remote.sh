#!/usr/bin/env bash
# Remote build + render scoring of a finished batch on serverless ACR (software WebGL2; never local Chromium/Docker).
#   tools/agent-eval/score-remote.sh <batch> [shards=4]
set -euo pipefail
BATCH="${1:?batch name}"
SHARDS="${2:-4}"
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
node tools/agent-eval/stage.mjs "$BATCH"
FIRST="agenteval-${BATCH}-s0of${SHARDS}"
SPECS="tests/browser/agent-eval-score.spec.ts" EXTRA_DIRS="tools/agent-eval/_stage/${BATCH}" RUN_ID="$FIRST" tools/remote-acr/run.sh > "/tmp/${FIRST}.log" 2>&1 || true
pids=()
for ((i = 1; i < SHARDS; i++)); do
  ( SPECS="tests/browser/agent-eval-score.spec.ts" BUILD=0 IMAGE_TAG="run-${FIRST}" RUN_ID="agenteval-${BATCH}-s${i}of${SHARDS}" tools/remote-acr/run.sh > "/tmp/agenteval-${BATCH}-s${i}of${SHARDS}.log" 2>&1 || true ) &
  pids+=($!)
done
wait "${pids[@]}" 2>/dev/null || true
logs=()
for ((i = 0; i < SHARDS; i++)); do logs+=("tests/reports/remote-acr/agenteval-${BATCH}-s${i}of${SHARDS}/acr-run.log"); done
node tools/agent-eval/extract.mjs "$BATCH" "${logs[@]}"
az-auraone-gurbaksh acr repository delete -n picassostagingacr --image "aura3d-playwright:run-${FIRST}" --yes -o none || true
rm -rf "tools/agent-eval/_stage/${BATCH}"
