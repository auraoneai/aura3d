#!/usr/bin/env bash
# Stage /tmp/rr-dist (from rr-smoke.vite.config.ts) plus the GLBs the route requests into tests/support/rr-dist (git-ignored by hand: do not commit).
set -euo pipefail
cd "$(dirname "$0")/../.."
rm -rf tests/support/rr-dist
mkdir -p tests/support/rr-dist/aura-assets
cp -R /tmp/rr-dist/. tests/support/rr-dist/
for f in public/aura-assets/roadsterRush*.glb public/aura-assets/showcaseModernBuildingOne.*.glb; do
  case "$f" in *.????????.glb) cp "$f" tests/support/rr-dist/aura-assets/ ;; esac
done
cp public/aura-assets/apex-*.glb tests/support/rr-dist/aura-assets/
