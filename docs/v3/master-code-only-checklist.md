# v3 Master Code-Only Checklist

## Scope

This is the master execution checklist for code required before broad Three.js and Unity/Unreal-style claims are credible. It excludes public deployment and non-code business operations.

Do not check off an item until the implementation, tests, examples, and report evidence exist.

## 0. Truth And Example Integrity

- [ ] Rename or rewrite every example whose name overstates current capability.
- [ ] Add a source check that blocks phrases like "better than Three.js", "Unity/Unreal for the web", "production renderer", and "production ready" unless v3 gates pass.
- [ ] Add `tools/example-truth-audit/index.ts` to verify every portfolio card has a matching screenshot, browser test, and current known-limit note.
- [ ] Add a `tests/browser/example-screenshot-audit.spec.ts` that opens every portfolio example and stores screenshots under `tests/reports/v3-example-screenshots/`.
- [ ] Add a report `tests/reports/v3-current-capability.json` that states which v3 gates are blocked and why.
- [ ] Update examples so every page exposes a typed `window.__GALILEO3D_*__` state with `status`, `renderer`, `errors`, `diagnostics`, `visualClaim`, and `knownLimits`.

## 1. Renderer And GPU

- [ ] Implement production-oriented camera controls for examples: orbit, pan, zoom, fit-to-bounds, reset, and pointer/touch support.
- [ ] Implement a real HDR-capable render pipeline or explicitly block HDR/PBR parity claims.
- [ ] Implement image-based lighting with irradiance and specular prefiltering, or explicitly mark PBR as bounded/non-production.
- [ ] Implement calibrated tone mapping and color management with browser visual tests.
- [ ] Implement environment reflection sampling that visibly affects metallic/rough materials in real model scenes.
- [ ] Implement stable directional shadow maps with filtering, bias controls, and debug views.
- [ ] Implement contact shadows or a deliberate alternative for product/architecture/game scenes.
- [ ] Implement point/spot shadows only if examples or claims need them; otherwise block those claims.
- [ ] Implement depth texture support for postprocess and debug views.
- [ ] Implement SSAO, SSR, TAA, DOF, or other post effects only when there is a real visual demo and performance budget.
- [ ] Implement renderer resource lifetime diagnostics visible in examples.
- [ ] Implement render-pass and shader error overlays for developer debugging.
- [ ] Implement GPU timing where available with fallback CPU timing.
- [ ] Implement culling and batching evidence for large scenes.
- [ ] Implement LOD support for real model scenes.
- [ ] Implement instancing stress scenes with screenshots and frame metrics.
- [ ] Implement skinned mesh rendering beyond unlit proof paths.
- [ ] Implement morph target rendering for real glTF assets.
- [ ] Implement WebGPU real hardware path or keep WebGPU claims blocked.
- [ ] Add renderer feature flags so unsupported features fail visibly and do not silently render fake output.

## 2. Asset Pipeline And Content

- [ ] Replace placeholder image decoding in user-facing asset examples with real browser image decoding.
- [ ] Add a real local asset corpus under `fixtures/assets/v3/` with product, character, environment, architecture, and material test models.
- [ ] Add a glTF visual corpus runner that renders each asset and stores screenshots plus diagnostics.
- [ ] Add material fidelity tests for base color, normal, metallic-roughness, emissive, occlusion, alpha, double-sided, clearcoat, transmission, sheen, specular, and variants where supported.
- [ ] Add animation playback for glTF clips in the asset viewer.
- [ ] Add skinning and morph playback for real animated models.
- [ ] Add model hierarchy/tree inspection.
- [ ] Add mesh, material, texture, animation, camera, light, and extension inspectors.
- [ ] Add importer warnings for unsupported glTF extensions and unsupported material features.
- [ ] Add drag/drop local file import for `.gltf`, `.glb`, `.bin`, and image dependencies.
- [ ] Add import settings UI for scale, orientation, material mode, texture handling, compression, and animation import.
- [ ] Add KTX2/Basis code paths with real browser decoding evidence or block texture-compression claims.
- [ ] Add Draco and Meshopt real decode path evidence in browser examples.
- [ ] Add asset dependency graph UI or diagnostics.
- [ ] Add reimport and cache invalidation support for local editor projects.

## 3. Browser Editor Authoring

- [ ] Implement a real editor app shell under `apps/editor`.
- [ ] Implement a WebGL2 editor viewport that renders the active scene through the engine renderer.
- [ ] Implement hierarchy panel with create, rename, delete, duplicate, parent, reorder, and search.
- [ ] Implement inspector panel for transform, mesh, material, light, camera, physics, animation, script, and audio components.
- [ ] Implement asset browser with thumbnails, folders, import status, and drag/drop into scene.
- [ ] Implement transform gizmos for translate, rotate, scale with undo/redo and snapping.
- [ ] Implement selection outline and picking in the editor viewport.
- [ ] Implement scene save/load to a versioned local project format.
- [ ] Implement prefab or reusable scene object format.
- [ ] Implement material editor with texture slots and live viewport updates.
- [ ] Implement import settings panel wired to the asset pipeline.
- [ ] Implement play mode with isolated runtime state and reset on exit.
- [ ] Implement profiler panel with frame time, draw calls, GPU resources, memory estimates, physics, animation, and scripts.
- [ ] Implement debug overlays for bounds, colliders, lights, cameras, nav/paths if present, and render passes.
- [ ] Implement script/behavior authoring workflow or explicitly block visual scripting claims.
- [ ] Implement static export of a project authored through the editor.
- [ ] Add Playwright tests that create a project from scratch, import an asset, place it, edit material, add light/camera, enter play mode, save, reload, export, and smoke-test the exported app.

## 4. Runtime Systems

- [ ] Build a real game scene using engine rendering, physics, animation, input, particles, audio, and scripting.
- [ ] Add character controller or vehicle/controller abstraction if claimed.
- [ ] Add physics stress scenes for stacks, constraints, triggers, raycasts, shape casts, sleeping, CCD if claimed, and moving platforms.
- [ ] Add animation graph examples with real glTF character clips.
- [ ] Add blend tree and state machine debug visualization in a browser page.
- [ ] Add particles integrated into real scenes with blending, sorting, bounds, and performance diagnostics.
- [ ] Add audio scene example with spatial sources, mixer controls, and browser unlock handling.
- [ ] Add configurable input bindings and a bindings UI.
- [ ] Add mobile/touch control support for viewer/editor/game examples.
- [ ] Add behavior scripting examples with hot reload or documented reload flow.
- [ ] Add runtime error overlay for script, asset, render, and physics failures.

## 5. Product-Grade Local Examples

- [ ] Replace `product-configurator` primitive scene with a real model-based configurator.
- [ ] Replace `architecture-viewer` primitive scene with a real building/room model viewer.
- [ ] Replace `game-slice` primitive scene with a real interactive level.
- [ ] Replace `asset-viewer` proof UI with an inspection-focused asset tool.
- [ ] Add `examples/material-showroom` with real material spheres/objects and environment controls.
- [ ] Add `examples/character-animation-viewer` with skinned glTF animation.
- [ ] Add `examples/editor-authored-game` generated from the browser editor workflow.
- [ ] Add `examples/large-world-streaming` only if streaming/culling/LOD exists.
- [ ] Add `examples/renderer-stress-lab` with adjustable object/material/light counts.
- [ ] Add example screenshot generation command and store reports under `tests/reports/v3-examples/`.

## 6. Three.js And Babylon Comparison Code

- [ ] Create shared benchmark scene descriptors under `benchmarks/shared/scenes/`.
- [ ] Implement identical product configurator scene in Galileo3D, Three.js, and Babylon.js.
- [ ] Implement identical asset viewer load/render scene in Galileo3D, Three.js, and Babylon.js.
- [ ] Implement identical PBR material scene in Galileo3D, Three.js, and Babylon.js.
- [ ] Implement identical large static scene in Galileo3D, Three.js, and Babylon.js.
- [ ] Implement identical instancing scene in Galileo3D, Three.js, and Babylon.js.
- [ ] Implement identical skinned character scene in Galileo3D, Three.js, and Babylon.js.
- [ ] Implement identical postprocess scene only if Galileo3D supports the same effects.
- [ ] Add benchmark runner for startup time, asset load time, first frame, steady frame time, memory estimate, draw calls, shader count, texture bytes, and bundle size.
- [ ] Add screenshot diff tooling for comparison scenes.
- [ ] Add report generator that states where Galileo3D loses, ties, or wins.
- [ ] Block broad Three.js claims unless comparison reports show measured advantages for the exact claim.

## 7. Validation Tooling

- [ ] Add `pnpm verify:v3-code` as the code-only v3 gate.
- [ ] Add `pnpm verify:v3-examples` for all v3 example browser tests and screenshots.
- [ ] Add `pnpm verify:v3-rendering` for renderer visual and benchmark tests.
- [ ] Add `pnpm verify:v3-assets` for corpus loading/rendering/inspection tests.
- [ ] Add `pnpm verify:v3-editor` for editor workflow automation.
- [ ] Add `pnpm verify:v3-benchmarks` for local Three.js/Babylon/Galileo comparison reports.
- [ ] Add report freshness checks so v3 reports fail when source files changed after report generation.
- [ ] Add flaky-test detection for browser visual and benchmark tests.
- [ ] Add screenshot review manifest with paths, scene names, browser version, viewport, DPR, commit hash, and run ID.

## 8. Final Code Gates

- [ ] Gate 1: Current examples are honest and no longer overclaim.
- [ ] Gate 2: At least three product-grade local examples exist and pass screenshot/interaction tests.
- [ ] Gate 3: Asset corpus loads and renders with material/animation diagnostics.
- [ ] Gate 4: Browser editor can author and export a real app.
- [ ] Gate 5: Comparison benchmarks show exact measurable Galileo3D advantages in a defined niche.
- [ ] Gate 6: No broad Three.js or Unity/Unreal claim appears outside allowed gate-checked wording.

