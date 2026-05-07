# @galileo3d/assets

`@galileo3d/assets` owns asset identity, loading, caching, dependency tracking, import pipelines, worker job boundaries, and built-in loaders for runtime data.

## Public API

- `AssetManager`, `AssetRegistry`, `AssetCache`, `AssetHandle`: asset registration, load requests, cache retention, request cancellation, transient retry recovery, progress reporting, release, and disposal.
- `AssetLoader`, `AssetLoadRequest`, `AssetLoadError`, `LoadContext`: typed loader contracts, URL resolution, abort handling, and recoverable load failures.
- `AssetDependencyGraph`: deterministic dependency ownership and release ordering.
- `ImportPipeline`, `ImportStage`, `createMeshOptimizationStage`, `createTextureMipGenerationStage`: explicit import-stage execution for source assets, including deterministic indexed-mesh optimization and RGBA8 texture mip-chain generation hooks.
- `GLTFLoader`: JSON glTF and binary GLB loading for meshes, streamed external buffers, named scene selection, materials, textures, common PBR material extensions, `EXT_meshopt_compression` bufferView decode hooks, `KHR_draco_mesh_compression` primitive decode hooks, skins, animation clips, deterministic serialization, and disposed-state enforcement after release.
- `ImageLoader`, `TextureLoader`, `MaterialLoader`, `ShaderLoader`, `AudioLoader`, `SceneLoader`: built-in loaders for common engine asset types. Material descriptors can instantiate validated renderer `PBRMaterial` and `UnlitMaterial` instances.
- `WorkerAssetJobs`: worker-job scheduling boundary for CPU-side asset work with abort handling for worker and fallback pipeline execution.

## Verification

Asset cache/release behavior, dependency graphs, failed-load retry, in-flight cancellation, progress reporting, streamed external glTF buffers, shader/material loaders, material descriptor to renderer material creation, import-pipeline mesh optimization and texture mip-generation stages, worker job aborts, native scene loading, glTF/GLB parsing, named glTF scene selection, meshopt bufferView decode hook validation, Draco primitive decode hook validation, glTF asset disposal, PBR material extension validation/binding, skin/animation import, deterministic serialization, and browser texture upload are covered by `tests/unit/workstream5-runtime.test.ts` and `tests/browser/asset-texture-browser.spec.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.
