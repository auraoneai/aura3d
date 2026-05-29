# Clean Install Results

Generated: 2026-05-29T06:43:12.489Z

## Summary

- Checks passing: 33/33
- Workspace: `tests/reports/package-clean-install-workspace`

## Template Lifecycle

| Template | Install | Build | Dev Route | Preview Route | Asset Replacement | Dev Screenshot | Dev Profile | Preview Screenshot |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| `product-viewer` | yes | yes | yes | yes | yes | 316612 | cabinetPixels=2562, grillePixels=2880, metalPixels=1483, softboxPixels=7422, warmReflectionPixels=252, centerObjectPixels=5463, uniqueBuckets=76 | 335024 |
| `cinematic-scene` | yes | yes | yes | yes | yes | 618818 | cyanPixels=7511, amberPixels=583, rainPixels=3624, wetReflectionPixels=1309, centerHeroPixels=4794, darkAlleyPixels=13856, uniqueBuckets=162 | 618588 |
| `mini-game` | yes | yes | yes | yes | yes | 331099 | robotArmorPixels=1066, robotJointPixels=1786, boostPixels=42, coinPixels=461, hazardPixels=54, portalPixels=1246, cyanTrailPixels=3786, arenaPixels=7111, uniqueBuckets=125 | 331691 |

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
