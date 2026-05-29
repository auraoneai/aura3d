# Clean Install Results

Generated: 2026-05-29T06:11:36.087Z

## Summary

- Checks passing: 33/33
- Workspace: `tests/reports/package-clean-install-workspace`

## Template Lifecycle

| Template | Install | Build | Dev Route | Preview Route | Asset Replacement | Dev Screenshot | Dev Profile | Preview Screenshot |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| `product-viewer` | yes | yes | yes | yes | yes | 201573 | cabinetPixels=3116, grillePixels=1119, metalPixels=1358, softboxPixels=6917, warmReflectionPixels=184, centerObjectPixels=4979, uniqueBuckets=70 | 197715 |
| `cinematic-scene` | yes | yes | yes | yes | yes | 488962 | cyanPixels=5667, amberPixels=593, rainPixels=2793, wetReflectionPixels=659, centerHeroPixels=3427, darkAlleyPixels=7311, uniqueBuckets=139 | 516024 |
| `mini-game` | yes | yes | yes | yes | yes | 227458 | robotArmorPixels=1104, robotJointPixels=1399, boostPixels=39, coinPixels=689, hazardPixels=387, portalPixels=1732, cyanTrailPixels=3599, arenaPixels=5594, uniqueBuckets=127 | 227458 |

## Checks

| Check | Result | Detail |
|---|---:|---|
| `engine-tarball-clean-typescript-import` | pass | clean TypeScript app imports @aura3d/engine from tarball |
| `react-tarball-clean-typescript-import` | pass | clean TypeScript app imports @aura3d/react from tarball |
| `aura3d-cli-bin-clean-install` | pass | aura3d bin runs from clean npm install |
| `create-aura3d-bin-clean-install` | pass | create-aura3d --help runs from clean npm install |
| `product-viewer-clean-install` | pass | passed |
| `product-viewer-build` | pass | passed |
| `product-viewer-dev-route-health` | pass | passed |
| `product-viewer-preview-route-health` | pass | passed |
| `product-viewer-asset-replacement` | pass | passed |
| `product-viewer-missing-asset-output-actionable` | pass | passed |
| `product-viewer-invented-asset-id-type-fails` | pass | passed |
| `product-viewer-missing-manifest-actionable` | pass | passed |
| `product-viewer-dev-screenshot-profile-visual-cues` | pass | passed |
| `cinematic-scene-clean-install` | pass | passed |
| `cinematic-scene-build` | pass | passed |
| `cinematic-scene-dev-route-health` | pass | passed |
| `cinematic-scene-preview-route-health` | pass | passed |
| `cinematic-scene-asset-replacement` | pass | passed |
| `cinematic-scene-missing-asset-output-actionable` | pass | passed |
| `cinematic-scene-invented-asset-id-type-fails` | pass | passed |
| `cinematic-scene-missing-manifest-actionable` | pass | passed |
| `cinematic-scene-dev-screenshot-profile-visual-cues` | pass | passed |
| `mini-game-clean-install` | pass | passed |
| `mini-game-build` | pass | passed |
| `mini-game-dev-route-health` | pass | passed |
| `mini-game-preview-route-health` | pass | passed |
| `mini-game-asset-replacement` | pass | passed |
| `mini-game-missing-asset-output-actionable` | pass | passed |
| `mini-game-invented-asset-id-type-fails` | pass | passed |
| `mini-game-missing-manifest-actionable` | pass | passed |
| `mini-game-dev-screenshot-profile-visual-cues` | pass | passed |
| `starter-screenshot-files-distinct` | pass | passed |
| `starter-screenshot-profile-keys-distinct` | pass | passed |
