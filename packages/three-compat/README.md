# @aura3d/three-compat

`@aura3d/three-compat` owns Three.js compatibility adapters for Aura3D: core
objects, math, cameras, geometries, materials, loaders, controls, animation,
and migration helpers.

## Public API

- Core objects: `Object3DCompat`, `GroupCompat`, `MeshCompat`, `SceneCompat`,
  `RaycasterCompat`, sprites, points, and line segments.
- Math and camera adapters: `Vector3Compat`, `QuaternionCompat`,
  `Matrix4Compat`, `ColorCompat`, `PerspectiveCameraCompat`, and
  `OrthographicCameraCompat`.
- Geometry, material, texture, render-target, light, and helper adapters.
- Loader adapters including `GLTFLoaderCompat`, `OBJLoaderCompat`,
  `TextureLoaderCompat`, `HDRLoaderCompat`, and related loader helpers.
- Control adapters re-exported from `@aura3d/controls`.
- Animation, skeleton, skinned mesh, and morph target compatibility helpers.
- Migration helpers such as `migrateThreeToA3D`,
  `THREE_COMPAT_THREE_IMPORT_MAP`, `THREE_COMPAT_UNSUPPORTED_THREE_IMPORTS`, and
  compatibility warning generation.

## Not Covered: Postprocessing

Three.js `EffectComposer` and its passes are **not** migrated. Aura3D has no
GPU render-target composer equivalent yet, and the available production passes
operate on CPU pixel buffers, so aliasing the Three.js imports to them would
change behaviour while reporting success. `migrateThreeToA3D` leaves those
import specifiers unchanged and emits a `postprocessing-unsupported` warning, so
the failure is visible at the import site instead of at runtime. For emissive
bloom, use `effects.bloom()` from the root `@aura3d/engine` API.

## Package Boundary

This package is explicitly for compatibility and migration work. Public
agent-authored examples should normally use the root `@aura3d/engine` safe API
instead of direct `three` imports or raw loader code.
