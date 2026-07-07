# @aura3d/three-compat

`@aura3d/three-compat` owns Three.js compatibility adapters for Aura3D: core
objects, math, cameras, geometries, materials, loaders, controls, animation,
postprocessing, shaders, and migration helpers.

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
- Animation, skeleton, skinned mesh, morph target, postprocessing, and shader
  compatibility helpers.
- Migration helpers such as `migrateThreeToA3D`,
  `THREE_COMPAT_THREE_IMPORT_MAP`, and compatibility warning generation.

## Package Boundary

This package is explicitly for compatibility and migration work. Public
agent-authored examples should normally use the root `@aura3d/engine` safe API
instead of direct `three` imports or raw loader code.
