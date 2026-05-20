# Asset Pipeline And Content Plan

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


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

- [x] Real image decoding in user-facing viewer paths.
- [x] GLB and multi-file glTF drag/drop.
- [x] Dependency resolution for `.bin` and image files.
- [x] Scene hierarchy tree.
- [x] Mesh inspector: vertex count, index count, primitives, bounds, topology.
- [x] Material inspector: factors, textures, UV transforms, alpha mode, extension support.
- [x] Texture inspector: dimensions, format, color space, mip levels, compression.
- [x] Animation inspector and playback controls.
- [x] Skin/skeleton inspector.
- [x] Morph target inspector and sliders.
- [x] Camera/light inspector for glTF cameras and lights.
- [x] Warning panel for unsupported glTF features.
- [x] Screenshot capture button for local visual evidence.

### Done Criteria

- [x] Browser tests load inline glTF, multi-file glTF, GLB, Draco, Meshopt, KTX2/Basis, animated, skinned, morph, and material-extension fixtures where supported.
- [x] Unsupported fixtures produce explicit warnings and do not silently look correct.
- [x] The viewer screenshot shows the model, not just metadata.

## v3 Asset Corpus

Create checked-in or locally reproducible fixtures:

- [x] `fixtures/assets/v3/product/`
- [x] `fixtures/assets/v3/architecture/`
- [x] `fixtures/assets/v3/character/`
- [x] `fixtures/assets/v3/materials/`
- [x] `fixtures/assets/v3/animation/`
- [x] `fixtures/assets/v3/compression/`
- [x] `fixtures/assets/v3/problem-cases/`

Each asset entry needs:

- [x] source URL or generation script if license allows;
- [x] local file or deterministic fetch script;
- [x] expected feature manifest;
- [x] expected unsupported-feature manifest;
- [x] screenshot baseline;
- [x] loader diagnostics baseline.

## glTF Fidelity

### Missing Code

- [x] Material extension rendering verification.
- [x] Texture transform visual tests.
- [x] Alpha blend/mask ordering tests.
- [x] Double-sided rendering tests.
- [x] Vertex color rendering tests.
- [x] Multiple primitive mesh support in viewer examples.
- [x] Multiple node/mesh/material scene support in viewer examples.
- [x] Animation playback from glTF clips.
- [x] Skinning from glTF joints/inverse bind matrices.
- [x] Morph target playback from glTF data.
- [x] Material variant switching.
- [x] Sparse accessor support verification if claimed.
- [x] Interleaved/bufferView/byteStride stress tests.

### Done Criteria

- [x] `tests/reports/v3-gltf-corpus.json` lists every asset, features, unsupported features, render status, screenshot path, and error state.
- [x] Comparison scenes show the same asset in Galileo3D and Three.js/Babylon.js.

## Compression

### Missing Code

- [x] Draco browser decode path.
- [x] Meshopt browser decode path.
- [x] KTX2/Basis capability-based transcode target selection.
- [x] Fallback path when compressed texture formats are unavailable.
- [x] Decoder error reporting and recovery.
- [x] Performance timing for decode/transcode/load.

### Done Criteria

- [x] Asset viewer can open compressed fixtures and report decode timings.
- [x] Tests prove resource cleanup after failed decode.
- [x] Reports distinguish real decoded content from placeholders.
