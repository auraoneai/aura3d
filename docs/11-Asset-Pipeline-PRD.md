# Asset Pipeline PRD

## Purpose
The asset pipeline loads, caches, tracks, converts, and releases external resources such as images, textures, glTF scenes, materials, audio, shaders, and animation clips. It exists so real-world applications can load assets asynchronously without leaking resources or coupling loaders to renderer internals.

## Lessons From Failed Attempts
- Current and 2025 attempts included many asset loaders and cache concepts.
- `G3D2025/src/assets/IMPLEMENTATION_SUMMARY.md` noted compressed texture support as stubs despite broad completion claims.
- Old-G3D contained many overlapping asset managers, loaders, validators, streamers, blockchain/neural/quantum loaders, and workflow systems, showing severe scope creep.

Reuse conceptually:

- Asset manager, handles, cache, dependency graph.
- glTF, image, texture, audio, shader loaders.
- Reference counting and disposal.

Discard:

- Exotic loaders in the core rebuild.
- Loader systems that instantiate engine globals directly.
- "Support" claims for formats without tests.

## Target Architecture
Assets are identified by typed handles. Loaders convert external data into typed engine resources but do not own the frame loop.

Public API:

```ts
const assets = new AssetManager({ baseUrl: "/assets" });
const model = await assets.load("scene.gltf", GLTFAsset);
scene.add(model.createSceneNode());
assets.release(model);
```

## File-By-File Implementation Plan

### `packages/assets/src/AssetManager.ts`
- Purpose: public loading facade.
- Contains: loader registry, cache, load/release APIs.
- Edge cases: duplicate loads, cancellation, failed dependency.
- Tests: load once/cache, release, cancellation.

### `packages/assets/src/AssetRegistry.ts`
- Purpose: register loaders and asset types.
- Tests: duplicate type, missing loader.

### `packages/assets/src/AssetHandle.ts`
- Purpose: typed resource handle with lifecycle.
- Tests: retain/release and disposed access.

### `packages/assets/src/AssetLoader.ts`
- Purpose: loader interface.
- Contains: `canLoad`, `load`, `dependencies`.
- Tests: mock loader contract.

### `packages/assets/src/LoadContext.ts`
- Purpose: request context, base URL, abort signal, dependency loading.
- Tests: abort and relative URL resolution.

### `packages/assets/src/AssetCache.ts`
- Purpose: memory cache with ref counts and optional eviction.
- Edge cases: failed load should not poison cache unless configured.
- Tests: cache hit, failed load retry.

### `packages/assets/src/AssetDependencyGraph.ts`
- Purpose: dependency tracking for composite assets.
- Edge cases: cycles, shared textures.
- Tests: graph release order.

### `packages/assets/src/ImageLoader.ts`
- Purpose: browser image/bitmap loading.
- Tests: data URL and abort.

### `packages/assets/src/TextureLoader.ts`
- Purpose: convert images to renderer texture descriptors.
- Dependencies: rendering resource interfaces.
- Tests: texture descriptor and disposal.

### `packages/assets/src/GLTFLoader.ts`
- Purpose: glTF 2.0 JSON/GLB loader for meshes, nodes, materials, skins, animations.
- Edge cases: missing buffer, unsupported extension, coordinate transforms.
- Tests: minimal triangle glTF, texture glTF, animation glTF.

### `packages/assets/src/AudioLoader.ts`
- Purpose: audio buffer load/decode.
- Tests: mocked AudioContext decode.

### `packages/assets/src/ShaderLoader.ts`
- Purpose: load shader source as assets.
- Tests: source marker preservation.

### `packages/assets/src/MaterialLoader.ts`
- Purpose: material descriptor assets.
- Tests: JSON material to PBRMaterial descriptor.

### `packages/assets/src/SceneLoader.ts`
- Purpose: compose scene assets from glTF or native scene JSON.
- Tests: scene node creation.

### `packages/assets/src/ImportPipeline.ts`
- Purpose: optional offline/browser preprocessing stages.
- Contains: mesh optimization hooks, texture pipeline hooks, validation.
- Tests: pipeline order and failure.

### `packages/assets/src/WorkerAssetJobs.ts`
- Purpose: worker boundary for expensive import operations.
- Edge cases: worker unavailable, cancellation.
- Tests: fallback synchronous path.

### `packages/assets/src/index.ts`
- Purpose: public exports.
- Tests: package export smoke.

## Acceptance Criteria
- Duplicate asset loads share one in-flight promise and one cached result.
- Release disposes resources in dependency order.
- glTF minimal mesh loads into scene/renderable resources.
- Texture load reaches renderer and displays in browser.
- Failed asset load reports typed error with URL and dependency chain.
- Unsupported formats are explicit errors, not partial success.

## Testing Checklist
- Unit: cache, registry, handles, dependency graph, load context.
- Integration: glTF to scene, texture to material, animation clip import.
- Browser/runtime: image bitmap and texture upload.
- Module import/export: public asset exports only.
- Performance: repeated load/release leak test.

## Implementation Order
1. Asset handle, registry, cache, manager.
2. Image and texture loaders.
3. Shader and material loaders.
4. Minimal glTF loader.
5. Scene and animation import.
6. Worker job boundary.

