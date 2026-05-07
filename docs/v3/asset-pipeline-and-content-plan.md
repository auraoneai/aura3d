# Asset Pipeline And Content Plan

## Goal

Move from loader proof to real content pipeline credibility. The engine must load, render, inspect, animate, validate, and report real assets before it can be compared seriously with Three.js or Babylon.js loaders.

## Required File Areas

Expected primary code areas:

- `packages/assets/src/GLTFLoader.ts`
- `packages/assets/src/GLTFRenderResources.ts`
- `packages/assets/src/AssetManager.ts`
- `packages/assets/src/AssetCache.ts`
- `packages/assets/src/AssetDependencyGraph.ts`
- `packages/assets/src/ImportPipeline.ts`
- `packages/assets/src/ImageLoader.ts`
- `packages/assets/src/TextureLoader.ts`
- `packages/assets/src/TexturePipeline.ts`
- `packages/assets/src/GLTFCompressionDecoders.ts`
- `packages/assets/src/KTX2BasisTextureTranscoder.ts`
- `packages/assets/src/MeshOptimization.ts`
- `examples/asset-viewer`
- `examples/gltf-corpus-gallery`
- `apps/editor/src/import/*`
- `apps/editor/src/panels/AssetBrowserPanel.ts`

## Asset Viewer Upgrade

### Missing Code

- [ ] Real image decoding in user-facing viewer paths.
- [ ] GLB and multi-file glTF drag/drop.
- [ ] Dependency resolution for `.bin` and image files.
- [ ] Scene hierarchy tree.
- [ ] Mesh inspector: vertex count, index count, primitives, bounds, topology.
- [ ] Material inspector: factors, textures, UV transforms, alpha mode, extension support.
- [ ] Texture inspector: dimensions, format, color space, mip levels, compression.
- [ ] Animation inspector and playback controls.
- [ ] Skin/skeleton inspector.
- [ ] Morph target inspector and sliders.
- [ ] Camera/light inspector for glTF cameras and lights.
- [ ] Warning panel for unsupported glTF features.
- [ ] Screenshot capture button for local visual evidence.

### Done Criteria

- [ ] Browser tests load inline glTF, multi-file glTF, GLB, Draco, Meshopt, KTX2/Basis, animated, skinned, morph, and material-extension fixtures where supported.
- [ ] Unsupported fixtures produce explicit warnings and do not silently look correct.
- [ ] The viewer screenshot shows the model, not just metadata.

## v3 Asset Corpus

Create checked-in or locally reproducible fixtures:

- [ ] `fixtures/assets/v3/product/`
- [ ] `fixtures/assets/v3/architecture/`
- [ ] `fixtures/assets/v3/character/`
- [ ] `fixtures/assets/v3/materials/`
- [ ] `fixtures/assets/v3/animation/`
- [ ] `fixtures/assets/v3/compression/`
- [ ] `fixtures/assets/v3/problem-cases/`

Each asset entry needs:

- [ ] source URL or generation script if license allows;
- [ ] local file or deterministic fetch script;
- [ ] expected feature manifest;
- [ ] expected unsupported-feature manifest;
- [ ] screenshot baseline;
- [ ] loader diagnostics baseline.

## glTF Fidelity

### Missing Code

- [ ] Material extension rendering verification.
- [ ] Texture transform visual tests.
- [ ] Alpha blend/mask ordering tests.
- [ ] Double-sided rendering tests.
- [ ] Vertex color rendering tests.
- [ ] Multiple primitive mesh support in viewer examples.
- [ ] Multiple node/mesh/material scene support in viewer examples.
- [ ] Animation playback from glTF clips.
- [ ] Skinning from glTF joints/inverse bind matrices.
- [ ] Morph target playback from glTF data.
- [ ] Material variant switching.
- [ ] Sparse accessor support verification if claimed.
- [ ] Interleaved/bufferView/byteStride stress tests.

### Done Criteria

- [ ] `tests/reports/v3-gltf-corpus.json` lists every asset, features, unsupported features, render status, screenshot path, and error state.
- [ ] Comparison scenes show the same asset in Galileo3D and Three.js/Babylon.js.

## Compression

### Missing Code

- [ ] Draco browser decode path.
- [ ] Meshopt browser decode path.
- [ ] KTX2/Basis capability-based transcode target selection.
- [ ] Fallback path when compressed texture formats are unavailable.
- [ ] Decoder error reporting and recovery.
- [ ] Performance timing for decode/transcode/load.

### Done Criteria

- [ ] Asset viewer can open compressed fixtures and report decode timings.
- [ ] Tests prove resource cleanup after failed decode.
- [ ] Reports distinguish real decoded content from placeholders.

