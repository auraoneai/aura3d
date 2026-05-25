# V6 Progress

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Current status: complete
Current milestone: complete
Last verified command: pnpm production-runtime:release
Last verified at: 2026-05-14T22:55:20.872Z

## Completed Milestones

- [x] Milestone 0 - Truth, Progress, And V5 Failure Audit
- [x] Milestone 1 - Asset And Environment Corpus
- [x] Milestone 2 - WebGL2 Renderer Backend
- [x] Milestone 3 - PBR/HDR Pipeline
- [x] Milestone 4 - glTF Render Pipeline
- [x] Milestone 5 - Shadows, Transparency, And Postprocess
- [x] Milestone 6 - WebGPU Backend
- [x] Milestone 7 - Animation And Controls
- [x] Milestone 8 - Product Apps
- [x] Milestone 9 - Visual Gallery And Anti-Fake Gate
- [x] Milestone 10 - Same-Scene Three.js Parity
- [x] Milestone 11 - Workflows And Differentiation
- [x] Milestone 12 - Examples And Templates
- [x] Milestone 13 - Performance And Memory
- [x] Milestone 14 - Package And External Consumer
- [x] Milestone 15 - Docs And Claims
- [x] Milestone 16 - Release Readiness
- [x] Milestone 17 - Full Release Command
- [x] Milestone 18 - Product Decision Record

## Active Milestone

Complete

## Milestone 18 Verification Notes

- [x] Added `docs/project/production-runtime-roadmap-product-decision-record.md`.
- [x] Answered what G3D V6 does better than raw Three.js today.
- [x] Answered what G3D V6 matches Three.js on today.
- [x] Answered what Three.js still does better.
- [x] Identified production-ready V6 workflows.
- [x] Identified experimental V6 workflows.
- [x] Preserved blocked claims that remain blocked after V6.
- [x] Listed public-worthy screenshots and screenshots that are not public-worthy.
- [x] Defined the next product roadmap after V6.
- [x] Added `tools/production-runtime-product-decision/index.ts`.
- [x] Added `production-runtime:product-decision` script.
- [x] Added product decision report to release readiness.
- [x] Added product decision gate to `production-runtime:release`.
- [x] Verified product decision record command.

## Milestone 17 Verification Notes

- [x] Added `production-runtime:release` script.
- [x] Release script runs truth, progress, assets, typecheck, WebGL2, PBR/HDR, glTF render, effects, WebGPU, animation-controls, apps, visuals/gallery, Three.js comparison, workflows, examples, templates, performance, package, docs, and release-readiness gates.
- [x] Fixed root Vitest alias resolution for V6 public package subpaths used by workflow tests.
- [x] Updated completion audit to accept Milestone 17 as the active full-release-command milestone while keeping V6 not complete until Milestone 18 passes.
- [x] Verified full release command.

## Milestone 16 Verification Notes

- [x] `tools/production-runtime-production-renderer-readiness/index.ts`
- [x] `tools/production-runtime-completion-audit/index.ts`
- [x] `tools/production-runtime-release-readiness/index.ts`
- [x] `tests/reports/production-runtime-production-renderer-readiness.json`
- [x] `tests/reports/production-runtime-completion-audit.json`
- [x] `tests/reports/production-runtime-release-readiness.json`
- [x] Release readiness verifies required reports exist and pass.
- [x] Release readiness rejects mock, Canvas 2D, missing assets, missing HDR, missing textures, missing draw calls, hidden known gaps, and missing external render proof.
- [x] Completion audit explicitly keeps V6 not complete until Milestone 17 and Milestone 18 pass.
- [x] Added `production-runtime:release-readiness` script.
- [x] Verified Milestone 16 exit command.

## Milestone 15 Verification Notes

- [x] Added all required docs under `docs/project/production-runtime-roadmap-`.
- [x] Docs cover real app code, real renderer setup, real asset loading, HDR setup, material extension behavior, WebGPU boundary, Three.js migration, visual QA workflow, and performance profiling workflow.
- [x] `tests/unit/tools/production-runtime-docs.test.ts`
- [x] `tools/production-runtime-claim-registry/index.ts`
- [x] `tools/production-runtime-docs-readiness/index.ts`
- [x] `tests/reports/production-runtime-claim-registry.json`
- [x] `tests/reports/production-runtime-docs-readiness.json`
- [x] Claim registry lists allowed proof-backed claims and keeps full Three.js, full WebGPU, Unity, Unreal, every glTF extension, and broad performance superiority blocked.
- [x] Added `production-runtime:docs` script.
- [x] Verified Milestone 15 exit command.

## Milestone 14 Verification Notes

- [x] `tools/production-runtime-package-surface-readiness/index.ts`
- [x] `tools/production-runtime-package-smoke/index.ts`
- [x] `tools/production-runtime-external-vite-build/index.ts`
- [x] `tests/browser/production-runtime-external-consumer-render.spec.ts`
- [x] `tools/production-runtime-external-consumer/index.ts`
- [x] `tests/reports/production-runtime-package-surface-readiness.json`
- [x] `tests/reports/production-runtime-package-smoke.json`
- [x] `tests/reports/production-runtime-external-vite-build.json`
- [x] `tests/reports/production-runtime-external-consumer-render.json`
- [x] `tests/reports/production-runtime-external-consumer.json`
- [x] `tests/reports/production-runtime-external-consumer/external-consumer-render.png`
- [x] Package surface exposes `./workflows/production-runtime`, `./assets/browser`, `./animation/browser`, and `./rendering`.
- [x] Packed package installs in a fresh temp app and imports V6 workflow, rendering, asset, and animation APIs.
- [x] Fresh external Vite app builds from packed `@galileo3d/engine`.
- [x] Built external app renders Damaged Helmet with Studio Small 08 HDR through WebGL2 and passes nonblank screenshot proof.
- [x] Added `production-runtime:package` script.
- [x] Verified Milestone 14 exit command.

## Milestone 13 Verification Notes

- [x] `tests/performance/production-runtime-performance-baselines.ts`
- [x] `tests/browser/production-runtime-large-scene-performance.html`
- [x] `tests/browser/production-runtime-large-scene-performance.ts`
- [x] `tests/browser/production-runtime-large-scene-performance.spec.ts`
- [x] `tools/production-runtime-performance-readiness/index.ts`
- [x] `tests/reports/production-runtime-performance-baselines.json`
- [x] `tests/reports/production-runtime-large-scene-performance.json`
- [x] `tests/reports/production-runtime-performance-readiness.json`
- [x] `tests/reports/production-runtime-performance/large-scene-performance.png`
- [x] Baseline records frame samples, min/median/max, draw calls, texture memory estimate, static meshes, instances, instanced batches, culling metrics, and asset budget warnings.
- [x] Browser proof renders a real WebGL2 large instanced scene with 2,048 rendered instances, 2,048 culled instances, draw calls, texture bytes, frame timing, ready timing, screenshot, and nonblank pixel metrics.
- [x] Added `production-runtime:performance` script.
- [x] Verified Milestone 13 exit command.

## Milestone 12 Verification Notes

- [x] `packages/workflows/src/production-runtime/V6ExampleRuntime.ts`
- [x] Added public V6 browser workflow API via `@galileo3d/engine/workflows/production-runtime`.
- [x] Added browser-safe package exports for `@galileo3d/engine/assets/browser` and `@galileo3d/engine/animation/browser`.
- [x] Updated dist finalizer so asset/browser GLTF code links to browser-safe animation exports in packed builds.
- [x] `examples/production-runtime-examples/catalog.json`
- [x] `examples/production-runtime-examples/index.html`
- [x] `examples/production-runtime-examples/product-configurator/`
- [x] `examples/production-runtime-examples/damaged-helmet-hdr/`
- [x] `examples/production-runtime-examples/boom-box-textures/`
- [x] `examples/production-runtime-examples/material-extensions/`
- [x] `examples/production-runtime-examples/hdr-ibl-roughness/`
- [x] `examples/production-runtime-examples/architecture-day-night/`
- [x] `examples/production-runtime-examples/animated-character/`
- [x] `examples/production-runtime-examples/postprocess-cinematic/`
- [x] `examples/production-runtime-examples/large-instanced-scene/`
- [x] `examples/production-runtime-examples/webgpu-product/`
- [x] `examples/production-runtime-examples/threejs-migrated-scene/`
- [x] All 11 V6 examples use public package imports, load real imported GLB assets, load real HDR environments, render through WebGL2, and publish runtime proof.
- [x] `templates/production-product-configurator/`
- [x] `templates/production-asset-inspector/`
- [x] `templates/production-material-studio/`
- [x] `templates/production-architecture-viewer/`
- [x] `templates/production-webgpu-starter/`
- [x] `packages/create-g3d/templates/production-product-configurator/`
- [x] `packages/create-g3d/templates/production-asset-inspector/`
- [x] `packages/create-g3d/templates/production-material-studio/`
- [x] `packages/create-g3d/templates/production-architecture-viewer/`
- [x] `packages/create-g3d/templates/production-webgpu-starter/`
- [x] Every V6 template includes package metadata, browser entry, source entry, asset manifest with checksums, and README fetch/copy instructions.
- [x] Packed package external Vite builds pass for all five V6 templates.
- [x] `tests/browser/production-runtime-examples.spec.ts`
- [x] `tests/integration/production-runtime-create-g3d.test.ts`
- [x] `tests/browser/production-runtime-templates.spec.ts`
- [x] `tools/production-runtime-examples-readiness/index.ts`
- [x] `tools/production-runtime-template-readiness/index.ts`
- [x] `tests/reports/production-runtime-examples-readiness.json`
- [x] `tests/reports/production-runtime-template-readiness.json`
- [x] `tests/reports/production-runtime-template-pack/galileo3d-engine-1.0.0.tgz`
- [x] Added `production-runtime:examples` and `production-runtime:templates` scripts.
- [x] Verified Milestone 12 exit command.

## Milestone 11 Verification Notes

- [x] `packages/workflows/src/production-runtime/V6Workflows.ts`
- [x] `packages/workflows/src/production-runtime/index.ts`
- [x] `packages/workflows/src/index.ts`
- [x] Product, asset, material, architecture, and cinematic V6 workflow definitions exist.
- [x] Asset preflight validates provenance, local path, checksum, license, byte size, and render requirements before rendering.
- [x] Animation-only assets without asset-declared HDR IBL are warnings, while renderer workflow HDR proof remains mandatory through gallery/readiness gates.
- [x] Visual QA scores real renderer screenshots and fails missing proof, blank output, low entropy, missing draw calls, and unexpected backend.
- [x] Production renderer defaults include HDR environment, postprocess, camera framing, and runtime metrics.
- [x] `tests/unit/workflows/production-runtime-workflows.test.ts`
- [x] `tools/production-runtime-workflows-readiness/index.ts`
- [x] `tests/reports/production-runtime-workflows-readiness.json`
- [x] Added `production-runtime:workflows` script.
- [x] Verified Milestone 11 exit command.

## Milestone 10 Verification Notes

- [x] `tests/browser/production-runtime-threejs-parity.html`
- [x] `tests/browser/production-runtime-threejs-parity.ts`
- [x] `tests/browser/production-runtime-threejs-parity.spec.ts`
- [x] `tools/production-runtime-threejs-parity-readiness/index.ts`
- [x] `tests/reports/production-runtime-threejs-parity/browser-report.json`
- [x] `tests/reports/production-runtime-threejs-parity-readiness.json`
- [x] G3D and Three.js both render 12 actual GLB scenes.
- [x] Product, material, asset, and architecture categories are mandatory pass scenes.
- [x] Each scene produces G3D, Three.js, and diff screenshots with draw-call and nonblank pixel proof.
- [x] Gallery comparison screenshots exist for product, materials, asset, and architecture.
- [x] Added `production-runtime:compare-threejs` script.
- [x] Verified Milestone 10 exit command.

## Milestone 9 Verification Notes

- [x] `fixtures/production-runtime/gallery-manifest.json`
- [x] `tools/production-runtime-gallery-readiness/index.ts`
- [x] `tests/reports/production-runtime-gallery/manifest.json`
- [x] `tests/reports/production-runtime-gallery-readiness.json`
- [x] V6 gallery manifest enumerates WebGL2, PBR/HDR, glTF, effects, animation-controls, and app-suite screenshots.
- [x] Anti-fake validation checks every gallery entry for real renderer proof JSON, readiness report, nonblank PNG pixels, dimensions, file size, renderer backend, canvas context type, asset ids, HDR environment id, draw calls, materials, textures, texture memory, frame timing, visual score, and review status.
- [x] Gallery normalizes screenshots under `tests/reports/production-runtime-gallery/`.
- [x] Added `production-runtime:gallery` and `production-runtime:visuals` scripts.
- [x] Verified Milestone 9 exit command.

## Milestone 8 Verification Notes

- [x] `apps/product-configurator/`
- [x] `apps/automotive-configurator/`
- [x] `apps/architecture-viewer/`
- [x] `apps/asset-inspector/`
- [x] `apps/material-studio/`
- [x] `apps/character-viewer/`
- [x] `apps/cinematic-postprocess/`
- [x] `apps/large-scene-lab/`
- [x] `apps/webgpu-lab/`
- [x] `apps/threejs-parity-lab/`
- [x] Every V6 app contains `index.html`, `src/main.ts`, `src/scene.ts`, `src/ui.ts`, `src/assets.ts`, and `README.md`.
- [x] Every V6 app creates a real WebGL2 renderer, loads a real V6 GLB asset, loads a real HDR environment, renders to canvas, exposes `window.__g3dV6Runtime`, and supports a user interaction.
- [x] `apps/common/src/runtime.ts`
- [x] `packages/assets/src/browser-index.ts`
- [x] `tests/browser/production-runtime-product-configurator.spec.ts`
- [x] `tests/browser/production-runtime-automotive-configurator.spec.ts`
- [x] `tests/browser/production-runtime-architecture-viewer.spec.ts`
- [x] `tests/browser/production-runtime-asset-inspector.spec.ts`
- [x] `tests/browser/production-runtime-material-studio.spec.ts`
- [x] `tests/browser/production-runtime-character-viewer.spec.ts`
- [x] `tests/browser/production-runtime-cinematic-postprocess.spec.ts`
- [x] `tests/browser/production-runtime-large-scene-lab.spec.ts`
- [x] `tests/browser/production-runtime-webgpu-lab.spec.ts`
- [x] `tests/browser/production-runtime-threejs-parity-lab.spec.ts`
- [x] `tools/production-runtime-app-suite-readiness/index.ts`
- [x] `tests/reports/production-runtime-app-suite-readiness.json`
- [x] `tests/reports/production-runtime-app-suite/production-product-configurator.png`
- [x] `tests/reports/production-runtime-app-suite/automotive-configurator.png`
- [x] `tests/reports/production-runtime-app-suite/production-architecture-viewer.png`
- [x] `tests/reports/production-runtime-app-suite/production-asset-inspector.png`
- [x] `tests/reports/production-runtime-app-suite/production-material-studio.png`
- [x] `tests/reports/production-runtime-app-suite/character-viewer.png`
- [x] `tests/reports/production-runtime-app-suite/cinematic-postprocess.png`
- [x] `tests/reports/production-runtime-app-suite/large-scene-lab.png`
- [x] `tests/reports/production-runtime-app-suite/webgpu-lab.png`
- [x] `tests/reports/production-runtime-app-suite/threejs-parity-lab.png`
- [x] Added `production-runtime:apps` script.
- [x] Verified Milestone 8 exit command.

## Milestone 7 Verification Notes

- [x] `packages/rendering/src/production-runtime/AnimationControlsPipeline.ts`
- [x] V6 proves imported Cesium Man animation/skinning metadata flows into render workflow.
- [x] V6 proves morph target animation metadata from Animated Morph Cube.
- [x] V6 exposes production orbit/framing controls for imported assets.
- [x] `tests/unit/rendering/production-runtime-animation-controls.test.ts`
- [x] `tests/browser/production-runtime-animation-controls-real-renderer.spec.ts`
- [x] `tools/production-runtime-animation-controls-readiness/index.ts`
- [x] `tests/reports/production-runtime-animation-controls-readiness.json`
- [x] `tests/reports/production-runtime-animation-controls/cesium-man-animation.png`
- [x] `tests/reports/production-runtime-animation-controls/animated-morph-cube.png`
- [x] Added `production-runtime:animation-controls` script.
- [x] Verified Milestone 7 exit command.

## Milestone 6 Verification Notes

- [x] `packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts`
- [x] V6 WebGPU reports adapter/device capabilities without pretending parity.
- [x] V6 WebGPU renders or publishes an explicit hardware-unavailable report.
- [x] V6 WebGPU does not block WebGL2 production renderer claims when unavailable.
- [x] `tests/unit/rendering/production-runtime-webgpu-renderer.test.ts`
- [x] `tests/browser/production-runtime-webgpu-real-renderer.spec.ts`
- [x] `tools/production-runtime-webgpu-readiness/index.ts`
- [x] `tests/reports/production-runtime-webgpu-readiness.json`
- [x] Added `production-runtime:webgpu` script.
- [x] Verified Milestone 6 exit command.

## Milestone 5 Verification Notes

- [x] `packages/rendering/src/production-runtime/ProductionEffectsPipeline.ts`
- [x] V6 proves shadow-map rendering on imported-asset geometry.
- [x] V6 proves transparent render ordering with imported/render-resource scene data.
- [x] V6 proves tone mapping, bloom/color grade, FXAA/postprocess on renderer pixels.
- [x] `tests/unit/rendering/production-runtime-effects-pipeline.test.ts`
- [x] `tests/browser/production-runtime-effects-real-renderer.spec.ts`
- [x] `tools/production-runtime-effects-readiness/index.ts`
- [x] `tests/reports/production-runtime-effects-readiness.json`
- [x] `tests/reports/production-runtime-effects/damaged-helmet-effects.png`
- [x] Added `production-runtime:effects` script.
- [x] Verified Milestone 5 exit command.

## Milestone 4 Verification Notes

- [x] `packages/assets/src/asset-corpus/V6GLTFRenderPipeline.ts`
- [x] V6 glTF pipeline loads GLB URLs into render resources without Canvas 2D or mock renderer.
- [x] V6 glTF pipeline maps PBR textures, normal maps, ORM textures, emissive maps, skinning, morphs, and material extensions into renderer metadata.
- [x] V6 glTF pipeline renders multiple corpus assets, not only Damaged Helmet.
- [x] `tests/assets/production-runtime-gltf-render-pipeline.test.ts`
- [x] `tests/browser/production-runtime-gltf-render-pipeline.spec.ts`
- [x] `tools/production-runtime-gltf-render-readiness/index.ts`
- [x] `tests/reports/production-runtime-gltf-render-readiness.json`
- [x] `tests/reports/production-runtime-gltf-render/damaged-helmet.png`
- [x] `tests/reports/production-runtime-gltf-render/clearcoat.png`
- [x] `tests/reports/production-runtime-gltf-render/cesium-man.png`
- [x] Added `production-runtime:gltf-render` script.
- [x] Verified Milestone 4 exit command.

## Milestone 3 Verification Notes

- [x] `packages/rendering/src/production-runtime/PBRHDRPipeline.ts`
- [x] V6 loads real Radiance HDR data into renderer-ready environment metadata.
- [x] V6 creates diffuse irradiance, specular prefilter, and BRDF LUT resources.
- [x] V6 exposes ACES/filmic/linear tone mapping policy with exposure and white point.
- [x] V6 proves HDR environment changes visible output for the same imported GLB.
- [x] `tests/unit/rendering/production-runtime-pbr-hdr-pipeline.test.ts`
- [x] `tests/browser/production-runtime-pbr-hdr-real-renderer.spec.ts`
- [x] `tools/production-runtime-pbr-hdr-readiness/index.ts`
- [x] `tests/reports/production-runtime-pbr-hdr-readiness.json`
- [x] `tests/reports/production-runtime-pbr-hdr/damaged-helmet-studio-hdr.png`
- [x] `tests/reports/production-runtime-pbr-hdr/damaged-helmet-sunset-hdr.png`
- [x] Added `production-runtime:pbr-hdr` script.
- [x] Verified Milestone 3 exit command.

## Milestone 2 Verification Notes

- [x] `packages/rendering/src/production-runtime/ProductionWebGL2Renderer.ts`
- [x] `packages/rendering/src/production-runtime/ProductionRendererTypes.ts`
- [x] `packages/rendering/src/production-runtime/index.ts`
- [x] WebGL2 initialization rejects Canvas 2D/mock proof.
- [x] WebGL2 exposes render-target, draw-call, texture, program, and extension diagnostics.
- [x] WebGL2 renders imported V6 corpus geometry through the renderer path.
- [x] `tests/unit/rendering/production-runtime-webgl2-renderer.test.ts`
- [x] `tests/browser/production-runtime-webgl2-real-renderer.spec.ts`
- [x] `tools/production-runtime-webgl2-readiness/index.ts`
- [x] `tests/reports/production-runtime-webgl2-readiness.json`
- [x] `tests/reports/production-runtime-webgl2/damaged-helmet-webgl2.png`
- [x] Added `production-runtime:webgl2` script.
- [x] Verified Milestone 2 exit command.

## Milestone 1 Verification Notes

- [x] `fixtures/asset-corpus/manifest.json`
- [x] `fixtures/environment-corpus/manifest.json`
- [x] `packages/assets/src/asset-corpus/V6AssetCorpus.ts`
- [x] `packages/environments/src/production-runtime/V6EnvironmentCorpus.ts`
- [x] `tests/assets/production-runtime-real-asset-corpus.test.ts`
- [x] `tests/unit/environments/production-runtime-hdr-environment-corpus.test.ts`
- [x] `tools/production-runtime-asset-readiness/index.ts`
- [x] `tests/reports/production-runtime-asset-readiness.json`
- [x] Added `production-runtime:assets` script.
- [x] Verified Milestone 1 exit command.

## Milestone 0 Verification Notes

- [x] `docs/project/production-runtime-roadmap-production-renderer-plan.md`
- [x] `docs/project/production-runtime-roadmap-status.md`
- [x] `docs/project/production-runtime-roadmap-progress.md`
- [x] `docs/project/production-runtime-roadmap-three-compat-visual-failure-audit.md`
- [x] `docs/project/production-runtime-roadmap-no-fake-visual-proof.md`
- [x] `docs/project/production-runtime-roadmap-known-gaps.md`
- [x] `docs/project/production-runtime-roadmap-blocked-claims.md`
- [x] `tools/production-runtime-truth/index.ts`
- [x] `tools/production-runtime-progress/index.ts`
- [x] `tools/production-runtime-three-compat-failure-audit/index.ts`
- [x] `tests/reports/production-runtime-truth.json`
- [x] `tests/reports/production-runtime-progress.json`
- [x] `tests/reports/production-runtime-three-compat-visual-failure-audit.json`
- [x] Add `production-runtime:truth`, `production-runtime:progress`, and `production-runtime:three-compat-failure-audit` scripts.
- [x] Verify Milestone 0 exit command.

## Known Gaps

- V6 production WebGL2 renderer backend has real imported-asset proof; broader scene feature proof remains incomplete.
- V6 WebGPU backend has honest availability/device reporting; real same-scene WebGPU visual parity remains incomplete.
- Real V6 glTF render pipeline has multi-asset imported-render proof; broader loader extension matrix remains incomplete.
- Real V6 HDR/IBL/PMREM has real HDR renderer proof for Damaged Helmet; broader asset matrix remains incomplete.
- Real V6 PBR material extension rendering is not complete.
- Real V6 flagship apps now have renderer-driven app-suite proof; deeper workflow polish and same-scene Three.js parity remain incomplete.
- Real V6 same-scene Three.js parity now has 12-scene evidence; broad Three.js API/ecosystem replacement remains blocked.
- V6 external package render proof is not complete.
- Full Three.js API parity remains blocked.
- Full WebGPU parity remains blocked.
- Unity and Unreal replacement claims remain blocked.

## Blocked Claims

- Full Three.js API replacement.
- Full Three.js ecosystem replacement.
- Full WebGPU parity.
- Unity replacement.
- Unreal replacement.
- Offline renderer parity.
- Every glTF extension.
- Broad performance superiority.
