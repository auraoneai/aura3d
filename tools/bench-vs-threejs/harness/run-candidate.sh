#!/usr/bin/env bash
# Run the whole Aura3D vs three.js benchmark for a CANDIDATE built from this workspace (not a published version) on the remote runner.
# Remote only (tools/remote-acr/run.sh: serverless Azure ACR task, software WebGL2); never local Docker or local Playwright.
#
#   tools/bench-vs-threejs/harness/run-candidate.sh [run-prefix]
#   BENCH_AURA_VERSION=4.5.0 tools/bench-vs-threejs/harness/run-candidate.sh [run-prefix]   # PUBLISHED mode
#
# Published mode (BENCH_AURA_VERSION set): same two Aura3D arms and the same groups, but the Aura3D arms are built from the registry install of
# @aura3d/engine and @aura3d/assets at that version (shared/aura-vite.ts, a stock vite build), not from the workspace sources. The version travels in
# the marker file because the remote runner does not forward environment variables to the container.
#
# Writes tools/bench-vs-threejs/candidate.json (a marker, removed on exit) so that build-all.mjs / full-game/build.mjs build the Aura3D arms from
# the workspace sources and the spec measures two Aura3D arms: `aura-auto` (the source as written, default render path) and `aura-production`
# (same source with `quality: "production"`), each against three.js (`three`, and `three-msaa` in group E).
# 1. group A builds the image once and measures baseline, pbr-viewer and game-loop,
# 2. groups B (forest), C (skinned character), D (shader water), E (three.js with 4x MSAA, all scenes) and the full game run in parallel on that image.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.."

PREFIX="${1:-cand-$(date -u +%Y%m%dT%H%M%SZ)}"
SPEC=tests/browser/bench-vs-threejs.spec.ts
MARKER=tools/bench-vs-threejs/candidate.json
line() { grep -n "test(\"group $1:" "$SPEC" | head -1 | cut -d: -f1; }
trap 'rm -f "$MARKER"' EXIT INT TERM
if [ -n "${BENCH_AURA_VERSION:-}" ]; then
  printf '{ "candidate": true, "published": "%s", "gitSha": "%s" }\n' "$BENCH_AURA_VERSION" "$(git rev-parse HEAD)" > "$MARKER"
else
  printf '{ "candidate": true, "gitSha": "%s" }\n' "$(git rev-parse HEAD)" > "$MARKER"
fi
export EXTRA_DIRS="fixtures/environment-corpus/hdri"

RUN_ID="${PREFIX}-a" SPECS="$SPEC:$(line A)" tools/remote-acr/run.sh > "/tmp/${PREFIX}-a.out" 2>&1 &
apid=$!
until grep -q "build ok\|FATAL" "/tmp/${PREFIX}-a.out"; do sleep 10; done
grep -q FATAL "/tmp/${PREFIX}-a.out" && { cat "/tmp/${PREFIX}-a.out"; exit 3; }

pids=("$apid")
for g in B C D E; do
  BUILD=0 IMAGE_TAG="run-${PREFIX}-a" RUN_ID="${PREFIX}-$(echo "$g" | tr A-Z a-z)" SPECS="$SPEC:$(line "$g")" \
    tools/remote-acr/run.sh > "/tmp/${PREFIX}-$(echo "$g" | tr A-Z a-z).out" 2>&1 &
  pids+=($!)
done
BUILD=0 IMAGE_TAG="run-${PREFIX}-a" RUN_ID="${PREFIX}-fg" SPECS="tests/browser/fullgame-compare.spec.ts" EXTRA_DIRS= \
  tools/remote-acr/run.sh > "/tmp/${PREFIX}-fg.out" 2>&1 &
pids+=($!)
wait "${pids[@]}" || true
wait || true

logs=""
for g in a b c d e; do logs="$logs tests/reports/remote-acr/${PREFIX}-$g/acr-run.log"; done
cat <<EOF
Done. Next (image tag run-${PREFIX}-a is still in the registry: delete it with 'az-auraone-gurbaksh acr repository delete -n picassostagingacr --image aura3d-playwright:run-${PREFIX}-a --yes'):
  node tools/bench-vs-threejs/harness/extract.mjs <out>/results.json <out>/frames $logs
  node tools/bench-vs-threejs/harness/static-metrics.mjs tools/bench-vs-threejs <out>/static-metrics.json <dir with gpt-tokenizer>
  node tools/bench-vs-threejs/full-game/extract.mjs <out>/full-game-results.json <out>/fg-frames tests/reports/remote-acr/${PREFIX}-fg/acr-run.log
EOF
