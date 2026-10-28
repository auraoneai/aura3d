#!/usr/bin/env bash
# Stage /tmp/apex-art/dist (tests/support/apex-art.vite.config.ts) plus the showcase GLBs the route still requests into tests/support/apex-art-dist (git-ignored: do not commit).
set -euo pipefail
cd "$(dirname "$0")/../.."
rm -rf tests/support/apex-art-dist
mkdir -p tests/support/apex-art-dist/aura-assets
cp -R /tmp/apex-art/dist/. tests/support/apex-art-dist/
for f in public/aura-assets/roadsterRush*.glb public/aura-assets/showcaseModernBuildingOne.*.glb; do
  case "$f" in *.????????.glb) cp "$f" tests/support/apex-art-dist/aura-assets/ ;; esac
done
cp public/aura-assets/apex-*.glb tests/support/apex-art-dist/aura-assets/
