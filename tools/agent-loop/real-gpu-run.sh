#!/usr/bin/env bash
# Real-GPU proof run: verify end to end through local Chrome (CDP) on 3 seeded scenes and 2 healthy templates.
# Prerequisite (no lock held): the scenes and staged templates are already built (`npm run build` in each folder), so verify runs with
# --skip typecheck,build. The shared REA lock is held ONLY while Chrome runs, never while building.
#   tools/agent-loop/real-gpu-run.sh [outDir]
set -u
cd "$(dirname "$0")/../.."
OUT="${1:-tests/reports/agent-loop/real-gpu}"
LOCK=/tmp/a3d-rea.lock
mkdir -p "$OUT/frames"
SEEDED=tests/fixtures/agent-loop-seeded
until mkdir "$LOCK" 2>/dev/null; do sleep 1; done
trap 'rmdir "$LOCK" 2>/dev/null' EXIT INT TERM
for scene in frozen-utime-water black-frame-no-light fog-hides-scene; do
  pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts verify "$SEEDED/$scene" --skip typecheck,build --out "$OUT/seeded-$scene.json" --frames-dir "$OUT/frames" > "$OUT/seeded-$scene.txt" 2>&1
  echo "seeded $scene exit $?"
done
for template in vite-vanilla product-viewer; do
  pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts verify "$SEEDED/_staged-$template" --skip build --out "$OUT/healthy-$template.json" --frames-dir "$OUT/frames" > "$OUT/healthy-$template.txt" 2>&1
  echo "healthy $template exit $?"
done
