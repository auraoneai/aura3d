# V6 Product Decision Record

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Decision

A3D V6 is a proof-backed WebGL2-first production renderer and workflow SDK for imported glTF/GLB assets, HDR image-based lighting, PBR material inspection, visual QA, package consumption, and developer-facing product templates. Its measured parity/exceeds claims are governed by V10 evidence. The product position after V6 is: compete where A3D has stronger workflow proof, renderer diagnostics, curated app templates, and release gates; keep broad Three.js API/ecosystem replacement blocked until the remaining surface area is implemented and proven.

## What A3D V6 Does Better Than Raw Three.js Today

- V6 ships first-party proof bundles for every flagship visual path: renderer backend, imported asset metadata, HDR environment binding, draw calls, texture memory, nonblank pixel readback, screenshots, readiness JSON, and claim boundaries.
- V6 treats visual output as a release artifact, not a loose example. The gallery manifest rejects blank PNGs, Canvas 2D proof, mock devices, missing HDR, missing real assets, missing textures, and missing draw calls.
- V6 has productized workflows around real renderer evidence: product configurator, asset inspector, material studio, architecture viewer, cinematic postprocess, examples, templates, external package builds, and external package render proof.
- V6 gives developers a narrower but clearer high-level workflow SDK through `@aura3d/engine/workflows/production-runtime`, `@aura3d/engine/assets/browser`, `@aura3d/engine/animation/browser`, and `@aura3d/engine/rendering`.
- V6 includes asset preflight, visual QA scoring, blocked-claim scanning, and release-readiness tooling as part of the product. Raw Three.js can do the rendering work, but it does not ship this opinionated product QA layer by default.
- V6 has a packed-package external consumer proof showing a fresh Vite app importing the package and rendering Damaged Helmet with Studio Small 08 HDR through WebGL2.

## What A3D V6 Matches Three.js On Today

- V6 renders real imported GLB assets in a real browser WebGL2 context with PBR texture metadata, HDR environment metadata, draw-call diagnostics, texture diagnostics, and nonblank screenshots.
- V6 has same-scene comparison evidence against Three.js for 12 corpus scenes across product, material, asset, architecture, character, and automotive categories.
- V6 can load and present the current V6 corpus assets, including textured PBR products, advanced material test assets, skinned animation metadata, morph target metadata, and animated assets.
- V6 supports the current proof-backed presentation chain: HDR IBL resources, filmic tone mapping, color grade, bloom, FXAA, shadow proof, transparency proof, orbit/framing controls, and runtime metrics.
- V6 examples and templates can be consumed through package-style imports and verified in browser tests rather than only by local fixture code.

## What Three.js Still Does Better

- Three.js has a much broader renderer, scene graph, loader, material, control, helper, shader, postprocess, WebXR, WebGPU, and ecosystem surface.
- Three.js has deeper real-world compatibility across arbitrary glTF files, compressed textures, extensions, animation cases, skeletal/morph combinations, lighting setups, and non-glTF asset formats.
- Three.js has more mature WebGPU renderer work and broader browser/hardware testing.
- Three.js has more examples, docs, community knowledge, third-party integrations, Stack Overflow coverage, production precedents, and battle-tested edge cases.
- Three.js still wins as a general-purpose 3D platform. A3D V6 only competes on proof-backed imported-asset workflow depth and release discipline for the current V6 scope.

## Production-Ready V6 Workflows

- Product Configurator: production-ready inside the V6 corpus boundary for imported GLB, HDR IBL, PBR material metadata, WebGL2 rendering, runtime metrics, and screenshot proof.
- Asset Inspector: production-ready inside the V6 corpus boundary for provenance, render metadata, visual proof, screenshots, and preflight reporting.
- Material Studio: production-ready for the current supported PBR and material-extension corpus, including clearcoat, sheen, and specular metadata/proof. It is not yet production-ready for every glTF material extension.
- Architecture Viewer: production-ready for the current day/night HDR environment workflow and imported-asset framing proof. It is not yet a full BIM, CAD, or massive-scene architecture tool.
- Cinematic Postprocess: production-ready for the current proof-backed tone mapping, color grade, bloom, FXAA, shadow, transparency, and postprocess presentation pipeline.
- External Vite Consumer: production-ready as a package-consumption smoke path for importing V6 workflow/rendering APIs and rendering a real GLB/HDR scene from the packed package.

## Experimental V6 Workflows

- WebGPU visual renderer parity is experimental. V6 reports real WebGPU availability and device creation honestly, but WebGPU same-scene visual parity remains blocked.
- Broad Three.js migration is experimental. The current migration proof is useful for scoped examples, not a general Three.js API compatibility layer.
- Large-scene performance is experimental beyond the current instancing/culling proof. V6 records frame timing and memory metrics, but broad performance superiority remains blocked.
- Full animation playback is experimental beyond current skinning/morph/animation metadata and visual proof paths.
- Full material-extension parity is experimental beyond the current clearcoat, sheen, specular, PBR texture, normal, ORM, and emissive proof surface.
- Broad external asset compatibility is experimental beyond the V6 verified corpus.

## Blocked Claims After V6

- Full Three.js API replacement remains blocked.
- Full Three.js ecosystem replacement remains blocked.
- Full WebGPU parity remains blocked.
- Unity replacement remains blocked.
- Unreal replacement remains blocked.
- Offline renderer parity remains blocked.
- Every glTF extension remains blocked.
- Broad performance superiority remains blocked.
- Arbitrary production asset compatibility remains blocked outside the verified corpus and explicit loader gates.

## Public-Worthy Screenshots

- `tests/reports/production-runtime-webgl2/damaged-helmet-webgl2.png`
- `tests/reports/production-runtime-hd-flagship/composed-product-hd.png`
- `tests/reports/production-runtime-hd-product-hero/damaged-helmet-hero.png`
- `tests/reports/production-runtime-hd-materials/pbr-materials-hd.png`
- `tests/reports/production-runtime-pbr-hdr/damaged-helmet-studio-hdr.png`
- `tests/reports/production-runtime-pbr-hdr/damaged-helmet-sunset-hdr.png`
- `tests/reports/production-runtime-gltf-render/damaged-helmet.png`
- `tests/reports/production-runtime-gltf-render/clearcoat.png`
- `tests/reports/production-runtime-gltf-render/cesium-man.png`
- `tests/reports/production-runtime-effects/damaged-helmet-effects.png`
- `tests/reports/production-runtime-app-suite/production-product-configurator.png`
- `tests/reports/production-runtime-app-suite/production-asset-inspector.png`
- `tests/reports/production-runtime-app-suite/production-material-studio.png`
- `tests/reports/production-runtime-app-suite/character-viewer.png`
- `tests/reports/production-runtime-app-suite/cinematic-postprocess.png`
- `tests/reports/production-runtime-external-consumer/external-consumer-render.png`

These screenshots are public-worthy only with scoped captions that say they are V6 WebGL2 imported-asset/HDR/PBR proof. They must not be captioned as full Three.js replacement, full WebGPU parity, or broad engine superiority.

## Screenshots Not Public-Worthy

- `tests/reports/legacy-product-viewer/product-viewer.png`
- `tests/reports/legacy-material-studio/material-studio.png`
- `tests/reports/legacy-asset-viewer/asset-viewer.png`
- `tests/reports/legacy-rendering-showcase/rendering-showcase.png`
- `tests/reports/three-compat-gallery/product/premium-product-viewer.png`
- `tests/reports/three-compat-gallery/automotive/automotive-configurator.png`
- `tests/reports/three-compat-gallery/architecture-day/interior-daylight.png`
- `tests/reports/three-compat-gallery/architecture-night/interior-night.png`
- `tests/reports/three-compat-gallery/materials/material-library.png`
- `tests/reports/three-compat-gallery/assets/asset-inspector.png`
- `tests/reports/three-compat-gallery/character/character-animation.png`
- `tests/reports/three-compat-gallery/postprocess/cinematic-postprocess.png`
- `tests/reports/three-compat-gallery/vfx/particle-vfx.png`
- `tests/reports/three-compat-gallery/large-scene/large-instanced-scene.png`
- `tests/reports/three-compat-gallery/shader-lab/shader-lab.png`
- `tests/reports/three-compat-gallery/threejs-migration/migrated-threejs-scene.png`
- `tests/reports/production-runtime-app-suite/threejs-parity-lab.png`
- `tests/reports/production-runtime-performance/large-scene-performance.png`
- Diff images from `tests/reports/production-runtime-threejs-parity/`

The V1 and V5 screenshots are explicitly not public-worthy because they are the failure examples that motivated V6. The V6 Three.js parity lab, performance screenshot, and diff screenshots are useful engineering evidence, but they should stay internal until the visual composition and comparison story are strong enough for public marketing.

## Next Product Roadmap After V6

1. Build a true scene graph and renderer API that developers can use without going through the V6 workflow wrappers.
2. Expand glTF compatibility across Draco, Meshopt, KTX2/Basis, punctual lights, cameras, variants, transmission, volume, iridescence, anisotropy, emissive strength, texture transforms, and animation edge cases.
3. Raise PBR/HDR parity with calibrated BRDF validation, environment prefilter validation, material swatch baselines, texture color-space checks, and side-by-side Three.js numeric thresholds.
4. Turn WebGPU from availability reporting into same-scene visual rendering parity on real hardware.
5. Improve flagship visuals with better product, automotive, architecture, character, VFX, and material assets that are suitable for public comparison.
6. Add developer ergonomics: stable API docs, migration guide, typed examples, devtools overlay, performance profiler, error diagnostics, asset optimizer, and CLI scaffolding.
7. Add production asset pipeline features: LODs, streaming, compression recommendations, cache policy, dependency graph inspection, import reports, and CI validation.
8. Add broad performance gates with multiple devices, mobile browser targets, memory ceilings, GPU timing where available, and regression tracking.
9. Add public demo deployment gates so screenshots are backed by live URLs and reproducible package builds.
10. Only after the above gates pass, revisit the claim that A3D can be marketed as a broad Three.js replacement.

## Evidence

- `pnpm production-runtime:release`
- `tests/reports/production-runtime-release-readiness.json`
- `tests/reports/production-runtime-hd-flagship-readiness.json`
- `tests/reports/production-runtime-hd-product-hero-readiness.json`
- `tests/reports/production-runtime-hd-materials-readiness.json`
- `tests/reports/production-runtime-production-renderer-readiness.json`
- `tests/reports/production-runtime-gallery-readiness.json`
- `tests/reports/production-runtime-threejs-parity-readiness.json`
- `tests/reports/production-runtime-external-consumer.json`
- `tests/reports/production-runtime-performance-readiness.json`
- `tests/reports/production-runtime-claim-registry.json`
