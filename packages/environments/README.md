# @aura3d/environments

`@aura3d/environments` owns HDRI environment manifests, PMREM diagnostics,
environment previews, and production environment corpus helpers for Aura3D.

## Public API

- `findThreeCompatEnvironmentPreset`, `listThreeCompatEnvironmentPresets`, and
  `loadThreeCompatEnvironmentManifest`: environment library lookup.
- `createThreeCompatEnvironmentGalleryModel`: gallery model data for environment
  previews.
- `createThreeCompatEnvironmentDiagnostics` and `verifyThreeCompatHdriFile`:
  diagnostics for HDRI environment assets.
- `createThreeCompatPMREMDiagnostics`: PMREM preset diagnostics.
- `createThreeCompatEnvironmentProbePreviews`: preview metadata for environment
  probes.
- `loadProductionEnvironmentManifest`, `inspectProductionHDR`, and
  `createProductionEnvironmentCorpusSummary`: production-runtime environment
  corpus helpers.

## Package Boundary

This package describes and validates environment assets and presets. Public
renderer claims such as IBL quality, PMREM parity, or production lighting still
require matching renderer/browser evidence for the API path being claimed.
