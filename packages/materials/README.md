# @aura3d/materials

`@aura3d/materials` owns PBR material presets, texture sets, material
validation, node materials, and material preview scene helpers for Aura3D.

## Public API

- `listThreeCompatPbrMaterials`, `findThreeCompatPbrMaterial`, and
  `THREE_COMPAT_PBR_MATERIAL_LIBRARY`: curated PBR material preset data.
- `THREE_COMPAT_REQUIRED_MATERIAL_CLASSES`: required compatibility material
  class coverage.
- `findThreeCompatTextureSet` and `THREE_COMPAT_TEXTURE_SETS`: texture set
  lookup.
- `createThreeCompatMaterialPreviewScene` and
  `createThreeCompatMaterialPreviewTile`: preview scene/tile helpers.
- `MaterialPresets` and `NodeMaterial` exports for package-level material
  helpers.

`@aura3d/materials/node` additionally exports
`summarizeThreeCompatMaterialLibrary` for filesystem-backed corpus validation.

## Package Boundary

This package provides material metadata and helper APIs. Public claims about
full PBR parity, texture fidelity, postprocess, or production material quality
need renderer tests and browser pixel evidence for the exact route or runtime
path being described.

The root entry is browser-pure. Filesystem-backed corpus validation is available
only from `@aura3d/materials/node`.
