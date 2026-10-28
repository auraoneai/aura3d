#!/usr/bin/env bash
# PRD-2 WP-7: one remote run of tests/browser/wp7-frame-structure.spec.ts on a CANDIDATE built from this workspace.
# Remote only (tools/remote-acr/run.sh: serverless Azure ACR task, software WebGL2); never local Docker or local Playwright.
#
#   tools/bench-vs-threejs/harness/run-wp7.sh <run-id> [out-dir]
#
# Stages tools/bench-vs-threejs/candidate.json (removed on exit) so the Aura3D arms (`aura-auto`, `aura-production`) build from workspace sources,
# runs the spec with KEEP_IMAGE=0, then writes <out-dir>/wp7.json (default evidence/vs-threejs/wp7/<run-id>).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.."
RUN_ID="${1:?run id}"
OUT="${2:-evidence/vs-threejs/wp7/$RUN_ID}"
MARKER=tools/bench-vs-threejs/candidate.json
NOMIN=tools/bench-vs-threejs/wp7-nominify
trap 'rm -f "$MARKER" "$NOMIN"' EXIT INT TERM
[ "${WP7_NOMINIFY:-0}" = 1 ] && touch "$NOMIN"
printf '{ "candidate": true, "gitSha": "%s" }\n' "$(git rev-parse HEAD)" > "$MARKER"
RUN_ID="$RUN_ID" KEEP_IMAGE=0 SPECS="tests/browser/wp7-frame-structure.spec.ts" tools/remote-acr/run.sh > "/tmp/${RUN_ID}.out" 2>&1 || true
tail -5 "/tmp/${RUN_ID}.out"
node tools/bench-vs-threejs/harness/wp7-extract.mjs "$OUT" "tests/reports/remote-acr/${RUN_ID}/acr-run.log"
