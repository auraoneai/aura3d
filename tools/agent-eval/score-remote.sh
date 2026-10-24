#!/usr/bin/env bash
# Remote build + render scoring of a finished batch on serverless ACR (software WebGL2; never local Chromium/Docker).
#   tools/agent-eval/score-remote.sh <batch> [shards=4] [tasks, e.g. 1 or 1,3]   (a task list re-scores just those and merges results)
set -euo pipefail
BATCH="${1:?batch name}"
SHARDS="${2:-4}"
TASKS="${3:-}"
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
node tools/agent-eval/stage.mjs "$BATCH" $TASKS
FIRST="agenteval-${BATCH}-s0of${SHARDS}"
az-auraone-gurbaksh acr repository delete -n picassostagingacr --image "aura3d-playwright:run-${FIRST}" --yes -o none 2>/dev/null || true
( SPECS="tests/browser/agent-eval-score.spec.ts" EXTRA_DIRS="tools/agent-eval/_stage/${BATCH}" RUN_ID="$FIRST" tools/remote-acr/run.sh > "/tmp/${FIRST}.log" 2>&1 || true ) &
first_pid=$!
# Other shards reuse the image the first shard builds: start them as soon as its tag exists.
for _ in $(seq 1 90); do
  if az-auraone-gurbaksh acr repository show-tags -n picassostagingacr --repository aura3d-playwright --query "contains(@, 'run-${FIRST}')" -o tsv 2>/dev/null | grep -qi true; then break; fi
  sleep 20
done
pids=()
for ((i = 1; i < SHARDS; i++)); do
  ( SPECS="tests/browser/agent-eval-score.spec.ts" BUILD=0 IMAGE_TAG="run-${FIRST}" RUN_ID="agenteval-${BATCH}-s${i}of${SHARDS}" tools/remote-acr/run.sh > "/tmp/agenteval-${BATCH}-s${i}of${SHARDS}.log" 2>&1 || true ) &
  pids+=($!)
done
wait "$first_pid" "${pids[@]}" 2>/dev/null || true
logs=()
for ((i = 0; i < SHARDS; i++)); do logs+=("tests/reports/remote-acr/agenteval-${BATCH}-s${i}of${SHARDS}/acr-run.log"); done
if [ -n "$TASKS" ]; then node tools/agent-eval/extract.mjs "$BATCH" --merge "${logs[@]}"; else node tools/agent-eval/extract.mjs "$BATCH" "${logs[@]}"; fi
az-auraone-gurbaksh acr repository delete -n picassostagingacr --image "aura3d-playwright:run-${FIRST}" --yes -o none || true
rm -rf "tools/agent-eval/_stage/${BATCH}"
