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

# §2.3: the pipelines forward scene/engine/flag-set selection through these
# env vars (GitLab spec.inputs -> QR_BENCH_*, GitHub workflow -> same names).
BENCH_ARGS=(--dist benchmarks/quality-rebuild/dist --out "$QR_BENCH_OUT" --timeout 120000 --strict)
[[ -n "${QR_BENCH_SCENES:-}" ]] && BENCH_ARGS+=(--scenes "$QR_BENCH_SCENES")
[[ -n "${QR_BENCH_ENGINES:-}" ]] && BENCH_ARGS+=(--engines "$QR_BENCH_ENGINES")

if [[ -n "${QR_BENCH_FLAG_SETS:-}" ]]; then
  # flags-bisect: one build above, one runner boot, N flag sets. Each set gets
  # its own out dir; failures inside a set are the bisection signal, not a
  # script failure — the summary decides the exit code.
  IFS=';' read -r -a flag_sets <<< "$QR_BENCH_FLAG_SETS"
  for set in "${flag_sets[@]}"; do
    set_dir="$QR_BENCH_OUT/${set//[^A-Za-z0-9_-]/_}"
    mkdir -p "$set_dir"
    echo "[ci.sh] flag set '${set}' -> ${set_dir}"
    if ! node benchmarks/quality-rebuild/capture.mjs "${BENCH_ARGS[@]}" --out "$set_dir" --flags "$set"; then
      echo "[ci.sh] flag set '${set}' reported failures (that IS the bisection signal; see bisect-summary.json)"
    fi
  done
  # {set, scene, status, drawCalls, errors[0], mountTiming}; exits non-zero
  # when the `none` control failed.
  # Sets contain commas (e.g. "$ALL,strict"), so they are passed ';'-separated.
  node benchmarks/quality-rebuild/bisect-summary.mjs "$QR_BENCH_OUT" "$QR_BENCH_FLAG_SETS"
else
  node benchmarks/quality-rebuild/capture.mjs "${BENCH_ARGS[@]}"
fi
