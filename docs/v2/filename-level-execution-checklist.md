# Filename-Level Execution Checklist

## Purpose

This checklist turns the v2 ambition into concrete file-level work. It exists to prevent vague claims such as "improve WebGPU" or "build an editor" from being marked complete without implementation, examples, tests, reports, and documentation.

Each checklist item has:

- Files or directories to create or modify.
- Required behavior.
- Required tests or examples.
- Required reports.
- Done criteria.

Do not mark a section complete because a related file already exists. Mark it complete only when the required behavior is implemented and verified.

## Completion Labels

Use these labels in issues, PRs, and progress docs:

| Label | Meaning |
|---|---|
| Not started | No implementation or verification exists. |
| Internal slice | Bounded implementation exists and internal tests pass. |
| App proven | Feature is used by a real example/demo app through public APIs. |
| Compared | Feature is benchmarked or compared against Three.js/Babylon.js or a relevant external baseline. |
| External credible | Feature has docs, examples, real browser/device evidence, and known limits. |

## 0. Truth, Release, And Trace Stability

### Files

- `tools/release-verification/index.ts`
- `tools/requirements-trace/index.ts`
- `tools/verify-trace/index.ts`
- `tools/claim-registry/index.ts`
- `tools/final-demo-validation/index.ts`
- `tests/performance/system-baselines.ts`
- `tests/unit/tools/claim-registry.test.ts`
- `docs/completion-audit.md`
- `docs/implementation-plan-final.md`
- `docs/rebuild-progress.md`
- `docs/requirements-trace.md`
- `docs/verification-evidence.md`
- `docs/v2/README.md`
- `docs/v2/claim-registry.md`
- `docs/v2/decision-gates.md`

### Tasks

- [x] Make `pnpm verify:release` fail if any report consumed by later gates was generated before the current release run started.
- [x] Record one release-run ID in every final report JSON.
- [x] Make `verify:trace` reject rows where product evidence is only a generated audit artifact.
- [x] Make `verify:trace` reject rows that cite `docs/rebuild-progress.md passed` without source and test files.
- [x] Add a contradiction scan: a `GO` audit cannot contain unqualified phrases such as `remains incomplete`, `not completion`, `NO-GO`, or stale incomplete counts for required production features.
- [x] Fix the physics performance failure or revise the budget only with documented hardware context and three-run medians.
- [x] Make `verify:demos` report the exact upstream failed report instead of only saying performance is incomplete.
- [x] Add `pnpm verify:release:repeat` that runs the full release gate three times and summarizes flake/failure rates.
- [x] Add claim-registry enforcement so public docs, package descriptions, example READMEs, and release notes cannot contain unregistered stronger claims.
- [x] Add a clean-checkout verification command that records git SHA, dirty state, package-manager version, OS, browser versions, GPU info when available, and release-run ID.

### Required Tests

- [x] `tests/unit/tools/verify-tools.test.ts` covers stale report detection.
- [x] `tests/unit/tools/verify-tools.test.ts` covers contradiction scanning.
- [x] `tests/unit/tools/verify-tools.test.ts` covers weak evidence rejection.
- [x] `tests/unit/tools/claim-registry.test.ts` covers allowed, scoped, blocked, stale, and missing-evidence claims.
- [x] `tests/performance/system-baselines.ts` reports min, median, max, attempts, and environment info.

### Required Reports

- [x] `tests/reports/final-release-verification.json`
- [x] `tests/reports/final-requirements-trace.json`
- [x] `tests/reports/final-performance.json`
- [x] `tests/reports/final-demo-validation.json`
- [x] `tests/reports/release-repeat.json`
- [x] `tests/reports/claim-registry.json`

### Done Criteria

- [x] `pnpm verify:release` passes three consecutive times from a clean checkout. Evidence: `pnpm verify:release:repeat` passed three full release runs on commit `35aba0ea5d12ac25b17728cb9ce855372f0b74f1`; `tests/reports/release-repeat.json` records row 81 as `proven: true`, all three runs have `ok: true`, no failed commands, and clean-checkout evidence for each run.
- [x] `pnpm verify:trace` fails against a fixture with stale generated evidence.
- [x] `docs/completion-audit.md`, `docs/implementation-plan-final.md`, and `docs/v2/decision-gates.md` agree on status.
- [x] No final report is green if a required upstream report is stale or failed.
- [x] Public claim language is blocked unless the claim registry links it to current evidence and known limits.

## 1. Renderer And WebGL2 Production Depth

### Files

- `packages/rendering/src/Renderer.ts`
- `packages/rendering/src/WebGL2Device.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/RenderGraph.ts`
- `packages/rendering/src/RenderPipeline.ts`
- `packages/rendering/src/RenderDevice.ts`
- `packages/rendering/src/Geometry.ts`
- `packages/rendering/src/VertexBuffer.ts`
- `packages/rendering/src/IndexBuffer.ts`
- `packages/rendering/src/Texture.ts`
- `packages/rendering/src/TextureBinding.ts`
- `packages/rendering/src/Sampler.ts`
- `packages/rendering/src/MaterialBinding.ts`
- `packages/rendering/src/PBRMaterial.ts`
- `packages/rendering/src/TexturedPBRMaterial.ts`
- `packages/rendering/src/NormalMappedPBRMaterial.ts`
- `packages/rendering/src/InstancedPBRMaterial.ts`
- `packages/rendering/src/SkinnedUnlitMaterial.ts`
- `packages/rendering/src/MorphUnlitMaterial.ts`
- `packages/rendering/src/PostProcessPass.ts`
- `packages/rendering/src/ShadowPass.ts`
- `packages/rendering/src/CascadedShadowMaps.ts`
- `packages/rendering/src/LightCollector.ts`
- `packages/rendering/src/LightUniforms.ts`
- `packages/scene/src/Camera.ts`
- `packages/scene/src/PerspectiveCamera.ts`
- `packages/scene/src/OrthographicCamera.ts`
- `packages/scene/src/TransformNode.ts`
- `packages/scene/src/Renderable.ts`
- `tests/browser/rendering-webgl2-harness.ts`
- `tests/browser/rendering-webgl2.spec.ts`
- `tests/visual/rendering-pixels.spec.ts`
- `tests/performance/system-baselines.ts`

### Tasks

- [x] Add a real large-scene WebGL2 harness with 5,000 static meshes, 10,000 instances, texture diversity, and multiple materials.
- [x] Make `Renderer.render(source, camera)` apply a real camera view/projection path instead of ignoring the camera argument.
- [x] Make scene rendering emit render items with per-node model matrices, normal matrices, and model-view-projection matrices.
- [x] Add transform/camera integration for scene renderables, glTF render resources, instanced renderables, skinned renderables, morph renderables, lights, picking, and culling. Bounded renderer evidence now covers scene renderables, glTF render-resource libraries, instanced renderables, morph renderables, scene cameras, lights, renderer-level scene picking, transformed/instanced pick bounds, and camera-frustum culling with an explicit authoring/debug disable path. Large-scene performance remains a separate benchmark claim.
- [x] Add frustum culling or explicit documentation that large-scene culling is not claimed.
- [x] Add an environment lighting path: renderer-level diffuse ambient, procedural environment-map approximation, sampled equirectangular RGBA8 environment-map texture approximation with roughness-dependent mip sampling, bounded BRDF LUT modulation, WebGL2 pixel evidence, and documented limits.
- [x] Add texture memory accounting and disposal diagnostics.
- [x] Add texture compression/transcoding integration to the renderer/material texture path with GPU memory and fallback diagnostics. Evidence: `packages/assets/src/KTX2BasisTextureTranscoder.ts` transcodes real KTX2/Basis payloads through `@loaders.gl/textures`; `packages/rendering/src/Texture.ts` carries compressed mip levels plus RGBA8 fallback levels; `packages/rendering/src/WebGL2Device.ts` uploads compressed/fallback mip levels and reports byte/fallback diagnostics; `tests/assets/gltf-compression-decoders.test.ts` uses a real Khronos KTX2 fixture; `tests/browser/rendering-webgl2.spec.ts` and `tests/browser/asset-texture-browser.spec.ts` pass after the upload-path change. Remaining broad corpus and capability-selection limits are documented in `docs/rendering/texture-compression.md`, `docs/assets/gltf-compression.md`, and `docs/known-limits.md`.
- [x] Add renderer lifecycle hardening for device/context loss, resize, DPR changes, disposal, hot reload/recreate, and long-running animation loops.
- [x] Add render-state leak tests for depth, blend, cull, viewport, framebuffer, and texture units.
- [x] Add high-DPI resize tests with CSS size, backing-buffer size, viewport, and pixel output.
- [x] Add material stress tests with base color, normal, metallic-roughness, occlusion, emissive, alpha mask, alpha blend, double-sided, vertex colors, and UV transforms.
- [x] Add skinning and morph stress tests beyond bounded toy cases.
- [x] Add postprocess graph demo with tone mapping, bloom, FXAA, and documented ordering.
- [x] Add shadow stress tests for moving camera, multiple casters, transparent casters, point/spot lights where claimed, and cascade split stability. Bounded evidence covers multiple casters, transparent-caster skipping, moved-caster projection, and unit-level moving-camera cascade split stress; point/spot shadow maps remain explicitly unclaimed in known limits rather than counted as supported.

### Required Tests

- [x] `tests/browser/rendering-large-scene-harness.ts`
- [x] `tests/browser/rendering-large-scene.spec.ts`
- [x] `tests/browser/rendering-camera-scene.spec.ts`
- [x] `tests/browser/rendering-context-lifecycle.spec.ts`
- [x] `tests/browser/rendering-resize-stress.spec.ts`
- [x] `tests/visual/rendering-material-matrix.spec.ts`
- [x] `tests/visual/pbr-environment-pixels.spec.ts`
- [x] `tests/visual/shadow-cascade-motion.spec.ts`
- [x] `tests/unit/rendering/scene-transform-uniforms.test.ts`
- [x] `tests/unit/rendering/render-state-leaks.test.ts`
- [x] `tests/unit/rendering/resource-lifetime.test.ts`

### Required Examples

- [x] `examples/rendering-large-scene/index.html`
- [x] `examples/rendering-large-scene/main.ts`
- [x] `examples/material-lab/index.html`
- [x] `examples/material-lab/main.ts`
- [x] `examples/pbr-material-lab/index.html`
- [x] `examples/pbr-material-lab/main.ts`
- [x] `examples/shadow-lab/index.html`
- [x] `examples/shadow-lab/main.ts`

### Done Criteria

- [x] The examples render through `Renderer` and `WebGL2Device`, not a 2D canvas visualization.
- [x] Scene examples use actual scene cameras, transforms, lights, and renderables rather than preprojected 2D positions or manually baked screen-space placement. The renderer-backed labs and scene-rendering roadmap examples now use scene cameras, transforms, lights, render resources, and renderables through the WebGL2 example harness. Subsystem validation examples for physics, animation, input, audio, corpus reports, and postprocess readback may still use 2D diagnostic presentation when they are not claiming scene-rendered output.
- [x] PBR examples include environment lighting and explain what is not yet physically correct.
- [x] Visual tests assert meaningful pixels for materials, shadows, postprocess, and resize.
- [x] Performance reports include large-scene and material-matrix frame-time budgets.
- [x] Known limits document unsupported material/shadow paths.

## 2. WebGPU Real Hardware Track

### Files

- `packages/rendering/src/WebGPUDevice.ts`
- `packages/rendering/src/RenderBackend.ts`
- `packages/rendering/src/RenderDevice.ts`
- `packages/rendering/src/ShaderLibrary.ts`
- `packages/rendering/src/ShaderModule.ts`
- `packages/rendering/src/RenderPipeline.ts`
- `packages/rendering/src/effects/GPUParticleBackend.ts`
- `tests/browser/rendering-webgpu-harness.html`
- `tests/browser/rendering-webgpu.spec.ts`
- `tests/browser/gpu-particle-backend.spec.ts`
- `docs/v2/validation-and-benchmark-plan.md`

### Tasks

- [x] Add a WebGPU adapter/device capability matrix report.
- [x] Add real browser WebGPU tests that do not rely only on injected fake adapters when `navigator.gpu` is available.
- [x] Add graceful unavailable-path tests for browsers without WebGPU.
- [x] Add shader compilation diagnostic tests for invalid WGSL, missing bindings, incompatible vertex layouts, and unsupported features.
- [x] Add render parity tests for triangle, textured material, instancing, morph, particles, render target, and readback; texture and morph are recorded as unsupported WebGPU parity cases rather than passed claims.
- [x] Add compute parity tests for GPU particles versus CPU particles over a deterministic seed.
- [x] Add WebGPU performance benchmarks against WebGL2 for the same scenes.

### Required Tests

- [x] `tests/browser/webgpu-real-device.spec.ts`
- [x] `tests/browser/webgpu-parity.spec.ts`
- [x] `tests/browser/webgpu-error-diagnostics.spec.ts`
- [x] `tests/performance/webgpu-vs-webgl2-baseline.ts`

### Required Reports

- [x] `tests/reports/webgpu-hardware-matrix.json`
- [x] `tests/reports/webgpu-parity.json`
- [x] `tests/reports/webgpu-vs-webgl2.json`

### Done Criteria

- [x] WebGPU claim docs list tested browsers, adapters, OS versions, and unsupported cases.
- [x] WebGPU release gate distinguishes fake/injected evidence from real-device evidence.
- [x] Public docs explain fallback behavior when WebGPU is unavailable.

## 3. Asset Pipeline And glTF Corpus

### Files

- `packages/assets/src/AssetManager.ts`
- `packages/assets/src/AssetCache.ts`
- `packages/assets/src/AssetDependencyGraph.ts`
- `packages/assets/src/GLTFLoader.ts`
- `packages/assets/src/GLTFRenderResources.ts`
- `packages/assets/src/TextureLoader.ts`
- `packages/assets/src/TexturePipeline.ts`
- `packages/assets/src/ImportPipeline.ts`
- `packages/assets/src/WorkerAssetJobs.ts`
- `packages/assets/src/MaterialLoader.ts`
- `packages/rendering/src/TexturedPBRMaterial.ts`
- `tests/unit/workstream5-runtime.test.ts`
- `tests/browser/asset-texture-browser-harness.ts`
- `tests/browser/asset-texture-browser.spec.ts`

### Tasks

- [x] Create a reproducible external asset corpus manifest.
- [x] Add Khronos glTF sample model validation.
- [x] Add Blender-export validation with multiple real-world files. `tests/assets/corpus/blender/blender-export-fixtures.manifest.json` pins three Khronos Vulkan Samples glTF fixtures with Blender generator metadata and SHA-256 hashes, and `tests/reports/blender-export-validation.json` records 3 pass / 0 warn / 0 fail through Galileo3D's glTF loader. This is checked-in fixture validation, not a local Blender executable export round trip or broad Blender/exporter corpus claim.
- [x] Wire real Draco decoder integration behind the existing decoder hook. `draco3d` is a checked-in dev dependency and `tests/assets/gltf-optional-external-decoders.test.ts` loads the pinned Khronos Duck Draco asset through `createDracoDecoder()`.
- [x] Wire real Meshopt decoder integration behind the existing decoder hook. `meshoptimizer` is a checked-in dev dependency and `tests/assets/gltf-optional-external-decoders.test.ts` loads the pinned Khronos MeshoptCubeTest asset through `createMeshoptDecoder()`.
- [x] Wire real KTX2/Basis texture transcoding workflow or document unsupported state.
- [x] Add import settings for color space, mipmaps, compression, scale, normals/tangents, animation import, and material variants.
- [x] Add round-trip tests for scene/asset serialization where claimed.
- [x] Add load cancellation, retry, dependency cleanup, and memory pressure tests at scale.
- [x] Add asset diagnostics that produce actionable messages for users.

### Required Tests

- [x] `tests/assets/gltf-corpus.test.ts`
- [x] `tests/assets/gltf-khronos-samples.test.ts`
- [x] `tests/assets/gltf-compression-decoders.test.ts`
- [x] `tests/assets/asset-cache-scale.test.ts`
- [x] `tests/browser/asset-viewer-browser.spec.ts`
- [x] `tests/visual/asset-corpus-pixels.spec.ts`

### Required Examples

- [x] `examples/asset-viewer/index.html`
- [x] `examples/asset-viewer/main.ts`
- [x] `examples/gltf-corpus-gallery/index.html`
- [x] `examples/gltf-corpus-gallery/main.ts`

### Required Reports

- [x] `tests/reports/gltf-corpus.json`
- [x] `tests/reports/asset-load-performance.json`
- [x] `tests/reports/asset-compatibility-threejs.json`
- [x] `tests/reports/blender-export-validation.json`

### Done Criteria

- [x] At least 100 external glTF/GLB assets are classified as pass, warn, or expected fail. `tests/assets/corpus/gltf-100-classification.manifest.json` records 100 pinned Khronos GLB source entries with SHA-256 hashes, and `tests/reports/gltf-100-classification.json` classifies them as 38 pass / 62 warn / 0 expected-fail. This is source classification evidence, not 100-asset loader/render/visual parity.
- [x] Every expected fail has a typed diagnostic and docs entry.
- [x] Galileo3D compatibility is compared against Three.js and Babylon.js loaders. `tests/reports/asset-compatibility-threejs.json` now records pinned Three.js 0.165.0 and Babylon.js 7.16.1 loader imports for all 17 current corpus assets with zero `not-run` external loader rows; this is loader-import evidence, not visual output parity.
- [x] Asset viewer can load real external models through public APIs.

## 4. Physics Production Track

### Files

- `packages/physics/src/PhysicsWorld.ts`
- `packages/physics/src/RigidBody.ts`
- `packages/physics/src/Collider.ts`
- `packages/physics/src/Shape.ts`
- `packages/physics/src/Constraint.ts`
- `packages/physics/src/Raycast.ts`
- `packages/physics/src/CollisionEvents.ts`
- `packages/physics/src/PhysicsStepper.ts`
- `packages/physics/src/PhysicsDebugDraw.ts`
- `packages/physics/src/ScenePhysicsBridge.ts`
- `packages/physics/src/ECSPhysicsBridge.ts`
- `tests/unit/workstream4.physics-animation.test.ts`
- `tests/browser/physics-browser-harness.ts`
- `tests/browser/physics-browser.spec.ts`
- `tests/performance/system-baselines.ts`

### Tasks

- [x] Fix or stabilize `physics-500-bodies-120-steps` performance.
- [x] Add broadphase profiling and optimization evidence.
- [x] Add continuous collision detection or document that CCD is not supported.
- [x] Add stress scenes for stacked bodies, fast bodies, constraints, sensors, filters, raycasts, and shape casts.
- [x] Add constraint robustness tests for hinge, slider, spring, fixed, and chains.
- [x] Add debug visualization example with toggles for colliders, contacts, normals, AABBs, and sleeping.
- [x] Add comparison benchmarks against Rapier, Cannon, or Ammo where feasible.

### Required Tests

- [x] `tests/unit/physics/broadphase.test.ts`
- [x] `tests/unit/physics/constraints-stress.test.ts`
- [x] `tests/unit/physics/ccd-or-fast-body.test.ts`
- [x] `tests/browser/physics-sandbox-browser.spec.ts`
- [x] `tests/performance/physics-comparison-baseline.ts`

### Required Examples

- [x] `examples/physics-sandbox/index.html`
- [x] `examples/physics-sandbox/main.ts`

### Done Criteria

- [x] Physics performance passes with headroom.
- [x] Physics sandbox is interactive and rendered through the renderer/debug line path.
- [x] Physics docs clearly state supported shapes, constraints, limits, and non-goals.

## 5. Animation Production Track

### Files

- `packages/animation/src/AnimationClip.ts`
- `packages/animation/src/AnimationTrack.ts`
- `packages/animation/src/AnimationMixer.ts`
- `packages/animation/src/AnimationAction.ts`
- `packages/animation/src/AnimationLayer.ts`
- `packages/animation/src/BlendTree.ts`
- `packages/animation/src/AnimationStateMachine.ts`
- `packages/animation/src/Skeleton.ts`
- `packages/animation/src/Skinning.ts`
- `packages/animation/src/RootMotion.ts`
- `packages/animation/src/SceneAnimationBridge.ts`
- `packages/animation/src/ECSAnimationBridge.ts`
- `packages/rendering/src/SkinnedUnlitMaterial.ts`
- `tests/browser/animation-browser-harness.ts`
- `tests/browser/animation-browser.spec.ts`
- `tests/visual/animation-pixels.spec.ts`

### Tasks

- [x] Add real glTF animated character corpus. `tests/assets/corpus/animated-character-corpus.manifest.json` now records pinned Khronos Cesium Man and Fox GLB entries with SHA-256 hashes; `tests/assets/gltf-animation-corpus.test.ts` imports both externally authored skinned characters and verifies distinct skin, joint, and animation clip structures.
- [x] Add animation clip browser controls: play, pause, scrub, speed, loop, crossfade.
- [x] Add stress test for many mixers and many skinned characters.
- [x] Add root motion example and scene/ECS bridge proof. Scene/ECS proof: `tests/integration/animation-root-motion-scene-ecs.test.ts`; runnable example: `examples/root-motion`.
- [x] Add animation state machine graph visualization or debug output.
- [x] Add retargeting plan: implement if claimed, or explicitly document as future work.
- [x] Add timeline/editor integration plan and initial UI if Unity/Unreal-style claim is pursued. Plan: `docs/animation/timeline-editor-integration.md`; initial UI: `apps/editor/src/panels/TimelinePanel.ts`.

### Required Tests

- [x] `tests/assets/gltf-animation-corpus.test.ts`
- [x] `tests/browser/animated-character-browser.spec.ts`
- [x] `tests/performance/animation-crowd-baseline.ts`
- [x] `tests/visual/skinned-animation-pixels.spec.ts`

### Required Examples

- [x] `examples/animated-character/index.html`
- [x] `examples/animated-character/main.ts`
- [x] `examples/animation-state-machine/index.html`
- [x] `examples/animation-state-machine/main.ts`

### Done Criteria

- [x] A real skinned glTF character plays in browser through the renderer. Evidence: `tests/browser/animation-browser-harness.ts` loads the pinned Khronos Cesium Man GLB fixture, samples the imported animation at two times, builds renderer skinning palettes, and `tests/browser/animation-browser.spec.ts` plus `tests/visual/skinned-animation-pixels.spec.ts` assert browser WebGL draw calls, visible pixels, and changed pixels between sampled frames.
- [x] Animation docs explain supported track types, blending, state machines, skinning, and unsupported authoring features.
- [x] Stress benchmarks define how many animated characters fit target frame budgets.

## 6. Editor Application Track

### Files

- `packages/editor-runtime/src/EditorRuntime.ts`
- `packages/editor-runtime/src/Selection.ts`
- `packages/editor-runtime/src/CommandHistory.ts`
- `packages/editor-runtime/src/InspectorModel.ts`
- `packages/editor-runtime/src/HierarchyModel.ts`
- `packages/editor-runtime/src/PickingService.ts`
- `packages/editor-runtime/src/Gizmo.ts`
- `packages/editor-runtime/src/TranslateGizmo.ts`
- `packages/editor-runtime/src/RotateGizmo.ts`
- `packages/editor-runtime/src/ScaleGizmo.ts`
- `packages/editor-runtime/src/PlayModeBridge.ts`
- `packages/editor-runtime/src/MaterialVariantWorkflow.ts`
- `packages/editor/src/index.ts`
- `tests/browser/editor-browser-harness.ts`
- `tests/browser/editor-browser.spec.ts`

### New Files

- `apps/editor/index.html`
- `apps/editor/src/main.ts`
- `apps/editor/src/EditorShell.ts`
- `apps/editor/src/panels/HierarchyPanel.ts`
- `apps/editor/src/panels/InspectorPanel.ts`
- `apps/editor/src/panels/AssetBrowserPanel.ts`
- `apps/editor/src/panels/ProfilerPanel.ts`
- `apps/editor/src/viewport/EditorViewport.ts`
- `apps/editor/src/project/ProjectSerializer.ts`
- `apps/editor/src/import/ImportSettingsPanel.ts`
- `tests/browser/editor-app.spec.ts`
- `tests/visual/editor-app-pixels.spec.ts`

### Tasks

- [x] Build a real browser editor app, not only editor-runtime tests.
- [x] Add hierarchy panel with selection, rename, create, delete, reparent.
- [x] Add inspector panel with transform, material, light, camera, physics, and script fields.
- [x] Add renderer-backed viewport with picking and transform gizmos.
- [x] Add asset browser with glTF import and preview.
- [x] Add project save/load using versioned scene/project JSON.
- [x] Add play/edit mode switch with state snapshot and restore.
- [x] Add profiler/debug panel with frame time, draw calls, resources, physics, particles.
- [x] Add plugin/extension API draft for panels, importers, and tools.

### Required Tests

- [x] `tests/browser/editor-app.spec.ts`
- [x] `tests/visual/editor-app-pixels.spec.ts`
- [x] `tests/unit/editor/project-serializer.test.ts`
- [x] `tests/unit/editor/plugin-api.test.ts`

### Done Criteria

- [x] A user can import a model, place it, edit transform/material, save, reload, and press play.
- [x] All editor UI operations go through public runtime APIs.
- [x] Editor docs include screenshots, workflow tutorials, and known limits.

## 7. Product Demos And Examples

### Files

- `examples/shared/exampleHarness.ts`
- `examples/README.md`
- `tests/browser/examples-runtime.spec.ts`
- `tests/visual/examples-pixels.spec.ts`
- `tests/visual/screenshot-diff.spec.ts`
- `tools/final-demo-validation/index.ts`

### New Examples

- `examples/product-configurator/index.html`
- `examples/product-configurator/main.ts`
- `examples/architecture-viewer/index.html`
- `examples/architecture-viewer/main.ts`
- `examples/game-slice/index.html`
- `examples/game-slice/main.ts`
- `examples/asset-viewer/index.html`
- `examples/asset-viewer/main.ts`
- `examples/physics-sandbox/index.html`
- `examples/physics-sandbox/main.ts`
- `examples/editor-app/README.md` or a link to `apps/editor`

### Tasks

- [x] Separate validation examples from learning/product examples in `examples/README.md`.
- [x] Ensure product examples render through the engine renderer, not primarily manual 2D canvas drawings.
- [x] Add real input interactions to product examples.
- [x] Add README files with systems used, run command, expected output, and known limits.
- [x] Add browser tests for each product example.
- [x] Add visual tests for each product example.
- [x] Add screenshot-diff artifacts for stable product demo states with platform-aware tolerance and CI artifact retention.
- [x] Make demo validation detect whether renderer-claim examples create a `Renderer`/`RenderDevice` path and draw meaningful WebGL pixels.
- [x] Add performance reports for each product example.

### Agent 6 Verified Slices

- [x] Add initial renderer-backed product demo slice for `examples/product-configurator`, `examples/architecture-viewer`, and `examples/game-slice` with README files and runtime WebGL2 smoke evidence.
- [x] Add committed browser coverage for the existing product demos that verifies ready state, WebGL2 renderer diagnostics, nonblank WebGL pixels, and pointer interactions.

### Done Criteria

- [x] Product examples prove Galileo3D can build useful browser apps.
- [x] A new developer can learn from example code without reading tests.
- [x] Demo validation fails if product examples are missing, non-renderer-backed, visually blank, or performance-regressing.
- [x] Demo validation fails if a product example only fakes a 3D claim with 2D canvas, static screenshots, or mock-only renderer output.

## 8. Three.js And Babylon.js Comparison Track

### New Files

- `benchmarks/threejs/package.json`
- `benchmarks/threejs/src/scenes/product-configurator.ts`
- `benchmarks/threejs/src/scenes/large-scene.ts`
- `benchmarks/threejs/src/scenes/skinned-characters.ts`
- `benchmarks/babylon/package.json`
- `benchmarks/babylon/src/scenes/product-configurator.ts`
- `benchmarks/babylon/src/scenes/large-scene.ts`
- `benchmarks/babylon/src/scenes/skinned-characters.ts`
- `benchmarks/fixtures/assets/manifest.json`
- `benchmarks/galileo/src/scenes/product-configurator.ts`
- `benchmarks/galileo/src/scenes/large-scene.ts`
- `benchmarks/galileo/src/scenes/skinned-characters.ts`
- `tools/compare-engines/index.ts`
- `docs/benchmarks/threejs-comparison.md`
- `docs/benchmarks/babylon-comparison.md`

### Tasks

- [x] Create equivalent scenes in Galileo3D, Three.js, and Babylon.js.
- [x] Pin exact Galileo3D, Three.js, Babylon.js, browser, OS, and hardware versions in benchmark reports.
- [x] Use the same assets, texture sizes, camera path, light setup, animation clips, render resolution, DPR, warmup, measurement window, and quality settings across engines.
- [x] Measure startup, first frame, asset load time, memory, frame time, draw calls, bundle size, and code size. `tools/compare-engines/index.ts --write-reports` now writes capped Playwright Chromium WebGL2 microbenchmark samples plus esbuild benchmark bundle artifacts into `tests/reports/comparison-threejs.json` and `tests/reports/comparison-babylon.json`; `claimUsable` remains false for broad competitive claims, while `supportedNicheClaims` allows only exact checked-in scaffold bundle-size wording.
- [x] Compare glTF compatibility on the same asset corpus.
- [x] Compare controls, materials, lights, shadows, postprocess, animation, particles, and docs.
- [x] Document where Galileo3D is worse, equal, or better.
- [x] Add a narrow claim statement if evidence supports it. `tests/reports/comparison-threejs.json` now records `supportedNicheClaims[0].id: "equivalent-scaffold-bundle-size-threejs"` with the exact wording that Galileo3D generated smaller esbuild browser benchmark bundles than Three.js for all three checked-in equivalent scaffold scenes on this run. Broad runtime, compatibility, maturity, visual parity, production release bundle, and broad superiority claims remain blocked.
- [x] Store raw benchmark samples, summary statistics, screenshots, and failure logs so reports can be independently audited.

### Agent 6 Verified Slices

- [x] Add deterministic comparison scaffold scenes for Galileo3D, Three.js, and Babylon.js product-configurator, large-scene, and skinned-characters workloads.
- [x] Add `tools/compare-engines/index.ts` to verify scaffold equivalence and generate caveated comparison reports.

### Required Reports

- [x] `tests/reports/comparison-threejs.json`
- [x] `tests/reports/comparison-babylon.json`
- [x] `docs/benchmarks/threejs-comparison.md`
- [x] `docs/benchmarks/babylon-comparison.md`

### Done Criteria

- [x] No "better than Three.js" claim is made without comparison reports.
- [x] Comparison is repeatable and includes raw data.
- [x] Docs identify the niche where Galileo3D is stronger. `docs/benchmarks/threejs-comparison.md`, `docs/comparisons/threejs.md`, `docs/v2/claim-registry.md`, and `docs/known-limits.md` define the exact checked-in scaffold bundle-size niche and list exclusions where Three.js remains stronger.
- [x] Any "better" claim names the measured dimension and excludes renderer maturity, ecosystem size, and broad compatibility unless those dimensions also win.

## 9. Unity/Unreal Web Workflow Track

### Files And Directories

- `apps/editor/**`
- `packages/editor-runtime/**`
- `packages/assets/**`
- `packages/scene/**`
- `packages/rendering/**`
- `packages/physics/**`
- `packages/animation/**`
- `packages/scripting/**`
- `docs/editor/**`
- `docs/workflows/**`

### Tasks

- [x] Build browser editor app from section 6.
- [x] Add project templates for product configurator, game slice, and asset viewer.
- [x] Add asset import UI and import settings.
- [x] Add scene hierarchy, inspector, material editor, light editor, camera editor, physics editor, and script editor.
- [x] Add timeline or animation state machine UI if animation authoring is claimed. Initial timeline panel renders in the editor; production timeline authoring remains explicitly out of scope.
- [x] Add prefab/composition format or explicitly document that prefabs are future work.
- [x] Add build/export workflow for static web deployment.
- [x] Add exported-project runtime package that can run without the editor loaded.
- [x] Add an editor-authored sample project checked into the repo with source project JSON and exported static build output.
- [x] Add profiler, resource inspector, shader/material diagnostics, and performance overlay.
- [x] Add plugin panel/tool/importer API.

### Required Tests

- [x] `tests/browser/editor-app.spec.ts`
- [x] `tests/browser/editor-import-workflow.spec.ts`
- [x] `tests/browser/editor-play-mode.spec.ts`
- [x] `tests/browser/editor-exported-project.spec.ts`
- [x] `tests/visual/editor-workflows.spec.ts`
- [x] `tests/integration/project-save-load.test.ts`
- [x] `tests/integration/editor-authored-project-replay.test.ts`

### Done Criteria

- [x] A developer can author, save, reload, and run a scene in the browser editor.
- [x] A developer can export that scene as a static web app and run the exported app in a browser smoke test.
- [x] At least one checked-in product example was created through the editor workflow and can be replayed by tests.
- [x] The workflow is documented with screenshots and video-ready steps.
- [x] The claim is narrowed to browser-first workflows, not general Unity/Unreal replacement.

## 10. User Documentation And Ecosystem

### New Files

- `docs/getting-started.md`
- `docs/concepts/engine-lifecycle.md`
- `docs/concepts/scene-vs-ecs.md`
- `docs/concepts/rendering.md`
- `docs/concepts/assets.md`
- `docs/concepts/physics.md`
- `docs/concepts/animation.md`
- `docs/concepts/editor-runtime.md`
- `docs/tutorials/product-configurator.md`
- `docs/tutorials/asset-viewer.md`
- `docs/tutorials/physics-sandbox.md`
- `docs/tutorials/editor-app.md`
- `docs/api/README.md`
- `docs/known-limits.md`
- `docs/claim-guidelines.md`
- `docs/comparisons/threejs.md`
- `docs/comparisons/babylonjs.md`
- `docs/comparisons/unity-unreal-web.md`
- `templates/vite-vanilla/**`
- `templates/react/**`
- `templates/vue/**`
- `templates/svelte/**`
- `.github/workflows/release.yml`
- `.github/workflows/browser-matrix.yml`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `SUPPORT.md`

### Tasks

- [x] Write a getting-started tutorial that renders a real scene.
- [x] Generate or maintain API docs for every public package.
- [x] Write conceptual docs that explain system boundaries.
- [x] Write tutorials around real examples.
- [x] Write known-limits docs from actual failing/unsupported cases.
- [x] Add starter templates for common frontend stacks.
- [x] Add package publishing and semver docs.
- [x] Add contribution guide, issue templates, and release checklist.
- [x] Add public claim guidelines that bind docs, README, release notes, and marketing copy to `docs/v2/claim-registry.md`.
- [x] Add docs versioning and deployment checks so API docs, tutorials, examples, package version, and changelog are aligned.
- [x] Add starter-template CI that installs each template from scratch, builds it, runs a smoke test, and verifies no local workspace links are required.

### Agent 6 Verified Slices

- [x] Add known-limits documentation covering the new product demo and benchmark scaffold limits.
- [x] Add first product-configurator tutorial, product demo index, public API entrypoint notes, and a Vite vanilla starter scaffold.
- [x] Add bounded starter-template verifier that copies each template into a fresh temp app, installs external dependencies, copies sanitized local Galileo runtime artifacts, builds, and smoke-checks the generated bundle.
- [x] Add new-developer basic app tutorial for the starter-template path.

### Done Criteria

- [x] A new developer can build a basic app without reading source tests.
- [x] Docs link every tutorial to a running example.
- [x] API docs match public package exports.
- [x] Known limits are visible and honest.
- [x] Package release, docs site, changelog, issue/support process, security policy, and compatibility matrix all reference the same version.

## Master Checklist For External Claims

### Before "Better Than Three.js"

- [x] Internal release candidate gate passes.
- [x] Product configurator exists and is renderer-backed.
- [x] Asset viewer exists and handles real external models. `tests/browser/asset-viewer-browser.spec.ts` now loads the pinned public Khronos Box GLB URL directly from `raw.githubusercontent.com` through the browser asset viewer and verifies public API metadata plus render-resource creation.
- [x] Camera-driven scene rendering, PBR environment lighting, and renderer-backed demo validation are complete for the claimed niche. The exact scaffold bundle-size niche is supported, and `tests/reports/pbr-environment-validation.json` records bounded WebGL2 PBR material-lab evidence plus `examples/pbr-camera-comparison` evidence against a same-page Three.js reference scene. `tests/reports/pbr-rendering-comparison.json` now records the dedicated rendered PBR comparison report with retained Galileo/reference/diff screenshots, a pinned scene descriptor hash, ROI/full-canvas delta metrics, semantic material checks in both renderers, and claim-boundary exclusions. The checked niche is limited to one bounded perspective-camera WebGL2 scene using the default `PBRMaterial`, direct lights, sampled equirectangular RGBA8 environment-map texture uniforms, roughness-dependent mip sampling, bounded CPU-generated RGBA8 environment mip helpers, and bounded BRDF LUT modulation. `docs/rendering/environment-lighting.md`, `docs/known-limits.md`, `docs/comparisons/threejs.md`, `docs/benchmarks/pbr-rendering-comparison.md`, and `docs/v2/claim-registry.md` still block HDR environment-map input, irradiance convolution, physically calibrated specular prefiltering, production-calibrated split-sum BRDF integration, reflection probes, color-management parity, production PBR parity, and broad visual/rendering-quality claims against Three.js.
- [x] Three.js comparison report exists.
- [x] Babylon.js comparison report exists.
- [x] Benchmark reports pin exact versions, hardware, browser settings, raw data, and screenshots.
- [x] Docs define the narrow niche where Galileo3D is better. The only allowed Three.js niche is smaller generated esbuild browser benchmark bundle bytes for the three checked-in equivalent scaffold scenes on this run; broad "better than Three.js" wording remains blocked.
- [x] Known limits page says where Three.js remains stronger.
- [x] Claim registry allows the exact claim text and blocks broader variants. `docs/v2/claim-registry.md` allows the exact scaffold bundle-size claims for Three.js and Babylon.js, while keeping unqualified "Galileo3D is better than Three.js." blocked under Gate C.

### Before "Unity/Unreal For The Web"

- [x] Browser editor app exists.
- [x] Asset import UI exists.
- [x] Scene hierarchy and inspector exist.
- [x] Gizmos are interactive in the editor viewport.
- [x] Save/load project workflow exists.
- [x] Play mode exists.
- [x] Static export workflow exists and exported app passes browser smoke tests.
- [x] Profiling/debug panels exist.
- [x] Plugin/extensibility model exists.
- [x] At least one app was authored through the editor.
- [x] The editor-authored app source project and exported output are checked in or reproducibly generated by CI.
- [x] Docs narrow the claim to browser-first applications.

### Before "Production Ready"

- [x] Release gate passes repeatedly. Evidence: `tests/reports/release-repeat.json` has `ok: true` after three consecutive full `pnpm verify:release` runs from a clean checkout; hard gate row 686 is `proven: true` with no blockers.
- [x] Browser/hardware matrix exists.
- [x] Asset corpus report exists.
- [ ] External demos exist. Blocked: `docs/examples/external-demos.md` records no externally hosted or independently openable public demo URLs, `docs/examples/external-demo-urls.json` has no public demo entries, and `tests/reports/release-repeat.json` marks this gate as `proven: false`. Next action: deploy durable public demo URLs, record them in `docs/examples/external-demo-urls.json`, run `pnpm verify:external-demos`, and add public-URL browser/screenshot artifacts.
- [x] Comparative benchmark reports exist.
- [x] Public docs and API reference exist.
- [x] Versioned package release exists. Evidence: `package.json` is `0.1.0-alpha.0` with `private: false`; `release-artifacts/galileo3d-engine-0.1.0-alpha.0.tgz` was created from the runtime-only package manifest; `docs/release-artifacts.json` records the tarball path and SHA-256 `a644039a2871784a1dbe014f29c932c6107c4c041532fcbe4a457f37535bd24e`; `pnpm verify:versioned-release` passed and the verifier checks that the tarball exists with a matching SHA-256.
- [x] Regression history exists.
- [x] Issue/support process exists.
- [x] Security, support, contribution, changelog, migration, compatibility, and claim-guideline docs exist.
- [x] Independent clean-checkout reproduction succeeds on another machine or agent from documented commands. Evidence: Codex sub-agent `019e011e-add3-7d31-ac08-929d8ad7b084` reproduced commit `f40d6d0ea0540462bb979d7f3657c2ae92745b2d` in `/tmp/g3d-independent-repro-f40d6d0`, confirmed `git status --short --untracked-files=all` had no output, and ran `pnpm verify:clean-checkout` with exit code `0`, `ok: true`, `dirty: false`, `dirtyFiles: 0`, and no blockers. The final local verifier run must record this evidence through `G3D_INDEPENDENT_REPRODUCTION_EVIDENCE`.
- [x] Known limitations are explicit.
