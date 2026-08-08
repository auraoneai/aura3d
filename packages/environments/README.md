# @aura3d/environments

`@aura3d/environments` owns HDRI environment manifests, PMREM diagnostics,
environment previews, and production environment corpus helpers for Aura3D.

## Public API

- `createThreeCompatPMREMDiagnostics`: PMREM preset diagnostics.
- `createThreeCompatEnvironmentProbePreviews`: preview metadata for environment
  probes.

`@aura3d/environments/node` additionally exports manifest lookup, gallery
models, HDRI file verification, and production-corpus inspection.

## Package Boundary

This package describes and validates environment assets and presets. Public
renderer claims such as IBL quality, PMREM parity, or production lighting still
require matching renderer/browser evidence for the API path being claimed.

The root entry is browser-pure. Filesystem/hash-backed corpus inspection and
manifest loading are available only from `@aura3d/environments/node`.
