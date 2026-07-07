# @aura3d/react

`@aura3d/react` owns React components and helpers for mounting Aura3D scenes
with typed assets, cameras, lights, effects, and product-viewer scene builders.

## Public API

- `AuraCanvas`: React canvas component that mounts `createAuraApp`, forwards
  diagnostics/options, and disposes the app on unmount.
- `Scene`: declarative scene wrapper for background, camera, timeline, and
  diagnostics options.
- `Model`: typed model node declaration using an `AuraAssetRef<"model">`.
- `Camera`: orbit, dolly, follow, or perspective camera declaration.
- `Lights`: studio, ambient, directional, and point light declaration.
- `Effect`: fog, bloom, and rain effect declaration.
- `buildSceneFromChildren`: converts supported React children into an
  `AuraSceneBuilder`.
- `productViewerScene`: convenience builder for a typed-asset product viewer
  scene.

## Package Boundary

This package wraps the root `@aura3d/engine` public API for React apps. It does
not replace the typed asset pipeline: model props should use generated
`assets.name` references, not raw GLB URLs or guessed asset IDs.
