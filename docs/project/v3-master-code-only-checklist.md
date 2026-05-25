# v3 Master Code-Only Checklist

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Scope

This is the master execution checklist for code required before broad Three.js and Unity/Unreal-style claims are credible. It excludes public deployment and non-code business operations.

Do not check off an item until the implementation, tests, examples, and report evidence exist.

## 0. Truth And Example Integrity

- [x] Rename or rewrite every example whose name overstates current capability.
- [x] Add a source check that blocks phrases like "better than Three.js", "Unity/Unreal for the web", "production renderer", and "production ready" unless v3 gates pass.
- [x] Add `tools/example-truth-audit/index.ts` to verify every portfolio card has a matching screenshot, browser test, and current known-limit note.
- [x] Add a `tests/browser/example-screenshot-audit.spec.ts` that opens every portfolio example and stores screenshots under `tests/reports/v3-example-screenshots/`.
- [x] Add a report `tests/reports/foundation-current-capability.json` that states which v3 gates are blocked and why.
- [x] Update examples so every page exposes a typed `window.__GALILEO3D_*__` state with `status`, `renderer`, `errors`, `diagnostics`, `visualClaim`, and `knownLimits`.

## 1. Renderer And GPU

- [x] Implement production-oriented camera controls for examples: orbit, pan, zoom, fit-to-bounds, reset, and pointer/touch support.
- [x] Implement a real HDR-capable render pipeline or explicitly block HDR/PBR parity claims.
- [x] Implement image-based lighting with irradiance and specular prefiltering, or explicitly mark PBR as bounded/non-production.
- [x] Implement calibrated tone mapping and color management with browser visual tests.
- [x] Implement environment reflection sampling that visibly affects metallic/rough materials in real model scenes. Evidence: `createV4EnvironmentLighting` drives generated environment resources in the flagship examples, and `tests/browser/product-demos.spec.ts` verifies product-configurator environment presets visibly change real model pixels.
- [x] Implement stable directional shadow maps with filtering, bias controls, and debug views.
- [x] Implement contact shadows or a deliberate alternative for product/architecture/game scenes.
- [x] Implement point/spot shadows only if examples or claims need them; otherwise block those claims.
- [x] Implement depth texture support for postprocess and debug views.
- [x] Implement SSAO, SSR, TAA, DOF, or other post effects only when there is a real visual demo and performance budget. Evidence: unsupported SSAO/SSR/DOF/TAA claims remain blocked; supported tone mapping, bloom, and FXAA have real-scene visual and timing evidence in `pnpm verify:foundation-rendering` and `pnpm verify:external-parity-rendering`.
- [x] Implement renderer resource lifetime diagnostics visible in examples.
- [x] Implement render-pass and shader error overlays for developer debugging.
- [x] Implement GPU timing where available with fallback CPU timing.
- [x] Implement culling and batching evidence for large scenes.
- [x] Implement LOD support for real model scenes. Evidence: the product configurator publishes real-model LOD diagnostics, large-scene reports include active LOD and culling metrics, and `pnpm verify:v3` passes with rendering and benchmark reports fresh.
- [x] Implement instancing stress scenes with screenshots and frame metrics.
- [x] Implement skinned mesh rendering beyond unlit proof paths. Evidence: `examples/character-animation-viewer` renders a real skinned CesiumMan glTF animation, `examples/game-slice` publishes lit skinned hero evidence, and the V3 runtime verifier passes.
- [x] Implement morph target rendering for real glTF assets. Evidence: the asset viewer drives glTF morph target weights through browser controls, the V4 corpus includes animated morph-weight playback, and `pnpm verify:v3` plus `pnpm verify:external-parity-assets` pass.
- [x] Implement WebGPU real hardware path or keep WebGPU claims blocked.
- [x] Add renderer feature flags so unsupported features fail visibly and do not silently render fake output.

## 2. Asset Pipeline And Content

- [x] Replace placeholder image decoding in user-facing asset examples with real browser image decoding.
- [x] Add a real local asset corpus under `fixtures/assets/v3/` with product, character, environment, architecture, and material test models.
- [x] Add a glTF visual corpus runner that renders each asset and stores screenshots plus diagnostics.
- [x] Add material fidelity tests for base color, normal, metallic-roughness, emissive, occlusion, alpha, double-sided, clearcoat, transmission, sheen, specular, and variants where supported.
- [x] Add animation playback for glTF clips in the asset viewer.
- [x] Add skinning and morph playback for real animated models. Evidence: `SceneAnimationBridge` applies `weights` tracks, `tests/unit/workstream4.physics-animation.test.ts` covers morph weights, `tests/browser/character-animation-viewer.spec.ts` covers skinned playback, and the V3 runtime verifier passes.
- [x] Add model hierarchy/tree inspection.
- [x] Add mesh, material, texture, animation, camera, light, and extension inspectors.
- [x] Add importer warnings for unsupported glTF extensions and unsupported material features.
- [x] Add drag/drop local file import for `.gltf`, `.glb`, `.bin`, and image dependencies.
- [x] Add import settings UI for scale, orientation, material mode, texture handling, compression, and animation import.
- [x] Add KTX2/Basis code paths with real browser decoding evidence or block texture-compression claims.
- [x] Add Draco and Meshopt real decode path evidence in browser examples.
- [x] Add asset dependency graph UI or diagnostics.
- [x] Add reimport and cache invalidation support for local editor projects.

## 3. Browser Editor Authoring

- [x] Implement a real editor app shell under `apps/editor`.
- [x] Implement a WebGL2 editor viewport that renders the active scene through the engine renderer.
- [x] Implement hierarchy panel with create, rename, delete, duplicate, parent, reorder, and search.
- [x] Implement inspector panel for transform, mesh, material, light, camera, physics, animation, script, and audio components.
- [x] Implement asset browser with thumbnails, folders, import status, and drag/drop into scene.
- [x] Implement transform gizmos for translate, rotate, scale with undo/redo and snapping.
- [x] Implement selection outline and picking in the editor viewport.
- [x] Implement scene save/load to a versioned local project format.
- [x] Implement prefab or reusable scene object format.
- [x] Implement material editor with texture slots and live viewport updates.
- [x] Implement import settings panel wired to the asset pipeline.
- [x] Implement play mode with isolated runtime state and reset on exit.
- [x] Implement profiler panel with frame time, draw calls, GPU resources, memory estimates, physics, animation, and scripts.
- [x] Implement debug overlays for bounds, colliders, lights, cameras, nav/paths if present, and render passes.
- [x] Implement script/behavior authoring workflow or explicitly block visual scripting claims.
- [x] Implement static export of a project authored through the editor.
- [x] Add Playwright tests that create a project from scratch, import an asset, place it, edit material, add light/camera, enter play mode, save, reload, export, and smoke-test the exported app.

## 4. Runtime Systems

- [x] Build a real game scene using engine rendering, physics, animation, input, particles, audio, and scripting.
- [x] Add character controller or vehicle/controller abstraction if claimed.
- [x] Add physics stress scenes for stacks, constraints, triggers, raycasts, shape casts, sleeping, CCD if claimed, and moving platforms.
- [x] Add animation graph examples with real glTF character clips.
- [x] Add blend tree and state machine debug visualization in a browser page.
- [x] Add particles integrated into real scenes with blending, sorting, bounds, and performance diagnostics.
- [x] Add audio scene example with spatial sources, mixer controls, and browser unlock handling.
- [x] Add configurable input bindings and a bindings UI.
- [x] Add mobile/touch control support for viewer/editor/game examples.
- [x] Add behavior scripting examples with hot reload or documented reload flow.
- [x] Add runtime error overlay for script, asset, render, and physics failures.

## 5. Product-Grade Local Examples

- [x] Replace `product-configurator` primitive scene with a real model-based configurator.
- [x] Replace `architecture-viewer` primitive scene with a real building/room model viewer.
- [x] Replace `game-slice` primitive scene with a real interactive level.
- [x] Replace `asset-viewer` proof UI with an inspection-focused asset tool.
- [x] Add `examples/material-showroom` with real material spheres/objects and environment controls.
- [x] Add `examples/character-animation-viewer` with skinned glTF animation.
- [x] Add `examples/editor-authored-game` generated from the browser editor workflow.
- [x] Add `examples/large-world-streaming` only if streaming/culling/LOD exists. Evidence: `examples/large-world-streaming/main.ts` implements bounded async chunk loading, culling, LOD, camera-path, frame, and memory metrics, verified by `tests/browser/large-world-streaming-external-parity.spec.ts`.
- [x] Add `examples/renderer-stress-lab` with adjustable object/material/light counts.
- [x] Add example screenshot generation command and store reports under `tests/reports/v3-examples/`.

## 6. Three.js And Babylon Comparison Code

- [x] Create shared benchmark scene descriptors under `benchmarks/shared/scenes/`.
- [x] Implement identical product configurator scene in Galileo3D, Three.js, and Babylon.js.
- [x] Implement identical asset viewer load/render scene in Galileo3D, Three.js, and Babylon.js.
- [x] Implement identical PBR material scene in Galileo3D, Three.js, and Babylon.js.
- [x] Implement identical large static scene in Galileo3D, Three.js, and Babylon.js.
- [x] Implement identical instancing scene in Galileo3D, Three.js, and Babylon.js.
- [x] Implement identical skinned character scene in Galileo3D, Three.js, and Babylon.js.
- [x] Implement identical postprocess scene only if Galileo3D supports the same effects. Evidence: broad same-effect competitor postprocess parity is not claimed; Galileo3D's supported real-scene postprocess path is verified locally, while comparison reports remain scoped to the implemented shared benchmark scenes.
- [x] Add benchmark runner for startup time, asset load time, first frame, steady frame time, memory estimate, draw calls, shader count, texture bytes, and bundle size.
- [x] Add screenshot diff tooling for comparison scenes.
- [x] Add report generator that states where Galileo3D loses, ties, or wins.
- [x] Block broad Three.js claims unless comparison reports show measured advantages for the exact claim.

## 7. Validation Tooling

- [x] Add `pnpm verify:foundation-code` as the code-only v3 gate.
- [x] Add `pnpm verify:v3-examples` for all v3 example browser tests and screenshots.
- [x] Add `pnpm verify:foundation-rendering` for renderer visual and benchmark tests.
- [x] Add `pnpm verify:foundation-assets` for corpus loading/rendering/inspection tests.
- [x] Add `pnpm verify:foundation-editor` for editor workflow automation.
- [x] Add `pnpm verify:foundation-benchmarks` for local Three.js/Babylon/Galileo comparison reports.
- [x] Add report freshness checks so v3 reports fail when source files changed after report generation.
- [x] Add flaky-test detection for browser visual and benchmark tests.
- [x] Add screenshot review manifest with paths, scene names, browser version, viewport, DPR, commit hash, and run ID.

## 8. Final Code Gates

- [x] Gate 1: Current examples are honest and no longer overclaim.
- [x] Gate 2: At least three product-grade local examples exist and pass screenshot/interaction tests.
- [x] Gate 3: Asset corpus loads and renders with material/animation diagnostics.
- [x] Gate 4: Browser editor can author and export a real app.
- [x] Gate 5: Comparison benchmarks show exact measurable Galileo3D advantages in a defined niche.
- [x] Gate 6: No broad Three.js or Unity/Unreal claim appears outside allowed gate-checked wording.
