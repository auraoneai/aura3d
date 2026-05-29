# Clean Install Results

Generated: 2026-05-29T09:34:34.285Z

## Summary

- Checks passing: 33/33
- Workspace: `tests/reports/package-clean-install-workspace`

## Template Lifecycle

| Template | Install | Build | Dev Route | Preview Route | Asset Replacement | Dev Screenshot | Dev Profile | Preview Screenshot |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| `product-viewer` | yes | yes | yes | yes | yes | 311618 | cabinetPixels=2575, grillePixels=2844, metalPixels=1515, softboxPixels=7245, warmReflectionPixels=228, centerObjectPixels=5549, uniqueBuckets=77 | 303531 |
| `cinematic-scene` | yes | yes | yes | yes | yes | 751543 | cyanPixels=6381, amberPixels=580, rainPixels=3048, wetReflectionPixels=855, centerHeroPixels=4451, darkAlleyPixels=12108, uniqueBuckets=153 | 677622 |
| `mini-game` | yes | yes | yes | yes | yes | 331777 | robotArmorPixels=1066, robotJointPixels=1798, boostPixels=43, coinPixels=455, hazardPixels=54, portalPixels=1243, cyanTrailPixels=3792, arenaPixels=7117, uniqueBuckets=127 | 331432 |

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
