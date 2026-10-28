#!/usr/bin/env bash
# Re-run the whole Aura3D vs three.js benchmark at the published Aura3D version (default 4.3.7) on the remote runner.
# Remote only (tools/remote-acr/run.sh: serverless Azure ACR task, software WebGL2); never local Docker or local Playwright.
#
#   tools/bench-vs-threejs/harness/run-4.3.7.sh [run-prefix]
#
# 1. builds the image once (group H, the 10-minute forest stall hunt, doubles as the build run),
# 2. runs groups A to E, G (CPU profiles) and the full game in parallel on that image,
# 3. waits for all of them and prints the extract and report commands.
# Groups are selected by the line of their `test(` in tests/browser/bench-vs-threejs.spec.ts.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.."

PREFIX="${1:-bench-$(date -u +%Y%m%dT%H%M%SZ)}"
SPEC=tests/browser/bench-vs-threejs.spec.ts
line() { grep -n "test(\"group $1:" "$SPEC" | head -1 | cut -d: -f1; }
export EXTRA_DIRS="fixtures/environment-corpus/hdri"

RUN_ID="${PREFIX}-h" SPECS="$SPEC:$(line H)" tools/remote-acr/run.sh > "/tmp/${PREFIX}-h.out" 2>&1 &
until grep -q "build ok\|FATAL" "/tmp/${PREFIX}-h.out"; do sleep 10; done
grep -q FATAL "/tmp/${PREFIX}-h.out" && { cat "/tmp/${PREFIX}-h.out"; exit 3; }

pids=()
for g in A B C D E G; do
  BUILD=0 IMAGE_TAG="run-${PREFIX}-h" RUN_ID="${PREFIX}-$(echo "$g" | tr A-Z a-z)" SPECS="$SPEC:$(line "$g")" \
    tools/remote-acr/run.sh > "/tmp/${PREFIX}-$(echo "$g" | tr A-Z a-z).out" 2>&1 &
  pids+=($!)
done
BUILD=0 IMAGE_TAG="run-${PREFIX}-h" RUN_ID="${PREFIX}-fg" SPECS="tests/browser/fullgame-compare.spec.ts" EXTRA_DIRS= \
  tools/remote-acr/run.sh > "/tmp/${PREFIX}-fg.out" 2>&1 &
pids+=($!)
wait "${pids[@]}" || true
wait || true

logs=""
for g in a b c d e g h; do logs="$logs tests/reports/remote-acr/${PREFIX}-$g/acr-run.log"; done
cat <<EOF
Done. Next:
  node tools/bench-vs-threejs/harness/extract.mjs <out>/results.json <out>/frames $logs
  node tools/bench-vs-threejs/harness/static-metrics.mjs tools/bench-vs-threejs <out>/static-metrics.json <dir with gpt-tokenizer>
  node tools/bench-vs-threejs/harness/report.mjs <out>/results.json <out>/static-metrics.json <out>/RESULTS.md [extras.json]
  node tools/bench-vs-threejs/full-game/extract.mjs <out>/full-game-results.json <out>/fg-frames tests/reports/remote-acr/${PREFIX}-fg/acr-run.log
(aux-*.json for the CPU profiles and the forest stall run are written next to results.json by extract.mjs)
EOF
