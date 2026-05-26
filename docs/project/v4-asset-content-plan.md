# V4 Asset And Content Plan

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


The asset pipeline must prove real-world visual credibility with local assets. The goal is not a large public corpus; the goal is enough local content to make the examples look real and expose unsupported features honestly.

## Local Corpus

- [x] Create `fixtures/asset-corpus/manifest.json`.
- [x] Add a product asset suitable for configurator materials and exploded views.
- [x] Add an architecture or room asset suitable for interior/exterior viewing.
- [x] Add a game environment asset suitable for an interactive level.
- [x] Add a character asset with skinning and animation.
- [x] Add a morph target asset with visible morph controls.
- [x] Add a skinned plus morph animated asset if broad animation fidelity is claimed. Evidence: broad animation fidelity is not claimed; V4 reports keep broad animation/skin parity blocked while separate skinned and animated-morph evidence exists.
- [x] Add material test assets for normal, metallic-roughness, emissive, occlusion, alpha, double-sided, and texture transform coverage.
- [x] Add environment maps used by all flagship scenes. Evidence: `fixtures/environment-corpus/manifest.json` plus `createV4EnvironmentLighting` are used by product, architecture, and game examples and verified by `pnpm verify:external-parity-examples`.
- [x] Store screenshot baselines and loader diagnostics for each corpus asset.

## Loader And Renderer Integration

- [x] Make `GLTFLoader` report every feature used by a loaded asset.
- [x] Make `GLTFRenderResources` create renderable data for textures, materials, skinning, morph targets, and variants where supported.
- [x] Add visible fallback material for unsupported features.
- [x] Add warnings for unsupported glTF extensions and unsupported material extensions.
- [x] Add lit skinning path in the renderer.
- [x] Add morph target rendering path in the renderer.
- [x] Add animation playback for transforms, skins, morph weights, and root motion where supported. Evidence: `SceneAnimationBridge` applies `weights` tracks, the V4 morph corpus asset now includes `morph-weight-smile`, `pnpm verify:external-parity-assets` passes, `tests/unit/workstream4.physics-animation.test.ts` covers bridge morph weights, and `tests/browser/character-animation-viewer.spec.ts` passes for skinned browser playback.

## Asset Viewer

- [x] Show model hierarchy, mesh stats, material slots, texture slots, animation clips, skin/skeleton, morph targets, cameras, lights, variants, and warnings.
- [x] Allow scrub/play/pause/loop for animation clips.
- [x] Allow morph slider adjustment with visible renderer update.
- [x] Allow material/environment/postprocess controls.
- [x] Allow drag/drop local `.gltf`, `.glb`, `.bin`, image, Draco, Meshopt, KTX2/Basis dependencies where supported.
- [x] Capture screenshots with diagnostic JSON.

## Done Criteria

- [x] `pnpm verify:external-parity-assets` passes.
- [x] `tests/reports/v4-asset-corpus.json` passes.
- [x] `tests/reports/v4-asset-material-fidelity.json` passes.
- [x] Every V4 corpus asset has a screenshot and diagnostics report.
- [x] Asset viewer screenshots show real textured models, not primitives.
