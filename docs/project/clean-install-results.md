# Clean Install Results

Generated: 2026-05-28T21:32:59.798Z

## Summary

- Checks passing: 33/33
- Workspace: `tests/reports/package-clean-install-workspace`

## Template Lifecycle

| Template | Install | Build | Dev Route | Preview Route | Asset Replacement | Dev Screenshot | Dev Profile | Preview Screenshot |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| `product-viewer` | yes | yes | yes | yes | yes | 192853 | cabinetPixels=279, grillePixels=628, metalPixels=2450, softboxPixels=4180, warmReflectionPixels=120, centerObjectPixels=7270, uniqueBuckets=71 | 182288 |
| `cinematic-scene` | yes | yes | yes | yes | yes | 379033 | cyanPixels=4399, amberPixels=490, rainPixels=2126, wetReflectionPixels=165, centerHeroPixels=3357, darkAlleyPixels=6470, uniqueBuckets=135 | 441815 |
| `mini-game` | yes | yes | yes | yes | yes | 202543 | robotArmorPixels=1120, robotJointPixels=1459, boostPixels=45, coinPixels=602, hazardPixels=463, portalPixels=1736, cyanTrailPixels=2965, arenaPixels=5522, uniqueBuckets=126 | 202543 |

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
