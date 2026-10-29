#!/usr/bin/env bash
# Every local Wonder World check, in order. Runs no browser and no monorepo-wide build; the browser specs and the
# production build + check-deploy run remotely (tools/remote-run.sh).
#   apps/veer-wonder-world/tools/check-all.sh            # fast checks
#   apps/veer-wonder-world/tools/check-all.sh --workspace # also the strict typecheck against workspace sources
set -uo pipefail
APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$APP/../.." && pwd)"
cd "$APP"
fail=0
step() { echo; echo "== $1"; shift; "$@" || { echo "FAILED: $*"; fail=1; }; }

step "typecheck (published @aura3d 4.5.0 types)" ./node_modules/.bin/tsc -p tsconfig.published.json --noEmit
if [ "${1:-}" = "--workspace" ]; then
  step "typecheck (monorepo workspace sources)" "$REPO/node_modules/.bin/tsc" -p "$APP/tsconfig.json" --noEmit
fi
step "unit tests" ./node_modules/.bin/vitest run --config vitest.config.ts
step "content validation (all 32 stories)" node tools/validate-wonder-world-content.mjs
# Regenerates both modules and compares them with the copies taken first, so the check also means something while the
# files are not yet committed (git diff ignores untracked files). A stale module is left regenerated, as with git diff.
step "generated files are current" bash -c '
  tmp="$(mktemp -d)"; trap "rm -rf \"$tmp\"" EXIT
  cp src/aura-assets.ts src/audio-manifest.ts src/assets/rights-manifest.ts "$tmp/" &&
  node tools/gen-aura-assets.mjs >/dev/null && node tools/gen-audio-manifest.mjs >/dev/null && node tools/gen-rights-manifest.mjs >/dev/null &&
  diff -u "$tmp/aura-assets.ts" src/aura-assets.ts && diff -u "$tmp/audio-manifest.ts" src/audio-manifest.ts &&
  diff -u "$tmp/rights-manifest.ts" src/assets/rights-manifest.ts'
step "repo game checks" node tools/game-checks.mjs
echo
if [ "$fail" -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED"; fi
exit "$fail"
