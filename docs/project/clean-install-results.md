# Clean Install Results

Generated: 2026-05-28T16:32:37.472Z

## Summary

- Checks passing: 31/31
- Workspace: `tests/reports/package-clean-install-workspace`

## Template Lifecycle

| Template | Install | Build | Dev Route | Preview Route | Asset Replacement | Dev Screenshot | Dev Profile | Preview Screenshot |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| `product-viewer` | yes | yes | yes | yes | yes | 105759 | cabinetPixels=1658, grillePixels=1985, metalPixels=145, softboxPixels=772, warmReflectionPixels=960, centerObjectPixels=10408, uniqueBuckets=32 | 105661 |
| `cinematic-scene` | yes | yes | yes | yes | yes | 147439 | cyanPixels=7077, amberPixels=68, rainPixels=1032, wetReflectionPixels=18068, centerHeroPixels=8095, darkAlleyPixels=372, uniqueBuckets=46 | 147439 |
| `mini-game` | yes | yes | yes | yes | yes | 140109 | playerPixels=128, coinPixels=102, hazardPixels=708, portalPixels=754, cyanTrailPixels=3687, arenaPixels=20581, uniqueBuckets=55 | 140109 |

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
| `product-viewer-dev-screenshot-profile-prompt-aligned` | pass | passed |
| `cinematic-scene-clean-install` | pass | passed |
| `cinematic-scene-build` | pass | passed |
| `cinematic-scene-dev-route-health` | pass | passed |
| `cinematic-scene-preview-route-health` | pass | passed |
| `cinematic-scene-asset-replacement` | pass | passed |
| `cinematic-scene-missing-asset-output-actionable` | pass | passed |
| `cinematic-scene-invented-asset-id-type-fails` | pass | passed |
| `cinematic-scene-missing-manifest-actionable` | pass | passed |
| `cinematic-scene-dev-screenshot-profile-prompt-aligned` | pass | passed |
| `mini-game-clean-install` | pass | passed |
| `mini-game-build` | pass | passed |
| `mini-game-dev-route-health` | pass | passed |
| `mini-game-preview-route-health` | pass | passed |
| `mini-game-asset-replacement` | pass | passed |
| `mini-game-missing-asset-output-actionable` | pass | passed |
| `mini-game-invented-asset-id-type-fails` | pass | passed |
| `mini-game-missing-manifest-actionable` | pass | passed |
| `mini-game-dev-screenshot-profile-prompt-aligned` | pass | passed |
