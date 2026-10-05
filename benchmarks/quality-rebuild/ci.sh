#!/usr/bin/env bash
# CI entry point for the quality-rebuild same-scene benchmark.
#
# Contract with .github/workflows/quality-rebuild-capture.yml (threejs-benchmark job):
#   QR_BENCH_OUT          output directory (default benchmarks/quality-rebuild/out)
#   QR_BENCH_CHROME_ARGS  Chromium GPU flags (read by capture.mjs)
# Expects `pnpm install --frozen-lockfile` and `pnpm exec playwright install chromium` to have run.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
export QR_BENCH_OUT="${QR_BENCH_OUT:-benchmarks/quality-rebuild/out}"
mkdir -p "$QR_BENCH_OUT"

# The workflow checks out with lfs: false. Fetch only the LFS blobs this benchmark serves
# (Khronos corpus GLBs and three typed catalog props). Failure is not fatal: the build skips
# pointer files and the affected scenes report load errors in report.json.
lfs_paths="fixtures/asset-corpus/damaged-helmet.glb,fixtures/asset-corpus/antique-camera.glb,fixtures/asset-corpus/clear-coat-test.glb,fixtures/asset-corpus/sheen-test-grid.glb,public/aura-assets/propRockA.52dd1f0f.glb,public/aura-assets/propRockB.c94b2733.glb,public/aura-assets/deepRecoveryCrateStandard.02520123.glb"
if command -v git-lfs >/dev/null 2>&1 || git lfs version >/dev/null 2>&1; then
  git lfs pull --include="$lfs_paths" || echo "::warning::git lfs pull failed; LFS-backed scenes will report missing assets"
else
  echo "::warning::git-lfs not installed; LFS-backed scenes will report missing assets"
fi

pnpm exec vite build --config benchmarks/quality-rebuild/vite.config.ts
node benchmarks/quality-rebuild/capture.mjs --dist benchmarks/quality-rebuild/dist --out "$QR_BENCH_OUT"
