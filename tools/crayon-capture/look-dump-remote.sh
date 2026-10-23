#!/usr/bin/env bash
# Submit look-dump for a batch of games to serverless ACR Tasks (no agent pool). Remote only.
#   tools/crayon-capture/look-dump-remote.sh <batch-name> <game-id[,game-id...]> [extra look-dump args]
# Prints the run id; fetch the log with
#   az-auraone-gurbaksh acr task logs --registry crmmeprodacr --run-id <id> > /tmp/look-run/<batch>/run.log
# then: pnpm exec tsx tools/crayon-capture/look-dump-split.ts --log /tmp/look-run/<batch>/run.log
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BATCH="$1"; ONLY="$2"; shift 2
EXTRA="$*"
WORK="/tmp/look-run/${BATCH}"
mkdir -p "$WORK"; cd "$WORK"
pnpm --dir "$REPO" exec esbuild tools/crayon-capture/look-dump.ts --bundle --platform=node --format=esm --external:playwright --outfile="$WORK/look.mjs" >/dev/null
cp "$REPO/tools/crayon-probe/games.json" games.json
cat > acr.yaml <<YAML
version: v1.1.0
steps:
  - cmd: mcr.microsoft.com/playwright:v1.59.1-noble bash -c "cd /workspace && npm init -y >/dev/null 2>&1 && npm i playwright@1.59.1 --no-audit --no-fund >/dev/null 2>&1 && CRAYON_PROBE_ROOT=/workspace ${LOOK_DEBUG_START:+LOOK_DEBUG_START=1} node look.mjs --manifest games.json --only ${ONLY} --out /tmp/out --emit-markers ${EXTRA} --launch-arg --enable-unsafe-swiftshader --launch-arg --use-angle=swiftshader --launch-arg --ignore-gpu-blocklist"
    timeout: ${TIMEOUT_S:-1800}
YAML
az-auraone-gurbaksh acr run --registry crmmeprodacr --file acr.yaml --no-wait . 2>&1 | tee "$WORK/submit.log"
