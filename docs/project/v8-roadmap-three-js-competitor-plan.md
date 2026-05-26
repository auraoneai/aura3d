# A3D V8: Build The Actual Three.js Competitor

> Historical note: This V8 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Read This First

V8 exists because docs/project/v4-engine-readiness-plan.md through docs/project/v7-roadmap-runtime-parity-plan.md did not produce a credible developer-facing renderer product. The repository contains real engineering work, but the visible product still fails the basic user test:

- `http://localhost:5180/apps/regression-animation-keyframes/` can sit at `loading` with a blank viewport.
- `http://localhost:5180/apps/character-viewer/` can take too long to become usable.
- Some outputs look like debug scenes, gray boxes, low-fidelity material tests, or static screenshots.
- Animation/physics examples do not visually compete with official Three.js examples.
- Reports, metrics, galleries, and screenshot bundles have repeatedly substituted for product quality.

V8 must stop that pattern.

The product objective is not another report. The product objective is:

> Build A3D into a production-quality, A3D-only WebGL2/WebGPU renderer and developer SDK that can load real GLTF/GLB assets, render high-fidelity PBR/HDR/IBL scenes, run animation/skinning/morph/IK/physics workflows, expose ergonomic public APIs, and ship examples that can stand next to the official Three.js examples without relying on Three.js runtime code.

Three.js is the competitor and reference baseline. Three.js is not allowed inside the A3D runtime, renderer, loaders, controls, materials, animation, physics, postprocess, skybox, or app implementation.

## Absolute Boundary

A3D must not become a wrapper around Three.js.

Allowed:

- Use Three.js in isolated comparison harnesses.
- Use Three.js screenshots as competitor reference output.
- Use Three.js source/examples to understand expected behavior.
- Use Three.js in `benchmarks/threejs/**`, `tools/**threejs**/**`, or clearly named comparison tests.

Forbidden:

- Importing `three` from `packages/rendering/**`, `packages/assets/**`, `packages/animation/**`, `packages/physics/**`, `packages/engine/**`, `apps/production-runtime-*/**`, `apps/v7-*/**`, `examples/production-runtime-examples/**`, or production templates.
- Using Three.js loaders, materials, PMREM, controls, animation mixer, decal geometry, skybox, shadows, postprocess, or physics as A3D implementation.
- Calling a screenshot A3D proof if Three.js rendered the A3D side.

If a product path depends on Three.js to render, load, animate, shade, or control the scene, V8 fails.

## Aggregate Failure Ledger From docs/project/v4-engine-readiness-plan.md Through docs/project/v7-roadmap-runtime-parity-plan.md

This section must be treated as binding context. Do not repeat these mistakes.

### docs/project/v4-engine-readiness-plan.md Mistakes

- Mistake: Tried to reset claims, but still centered the process around canonical screenshots and visual-quality gates.
- Mistake: Treated "PBR-ish" and "controlled workflows" as enough without forcing a product-grade renderer API and real examples first.
- Mistake: Allowed screenshots and reports to remain close to the core definition of progress.
- Mistake: Deferred product workflow depth until after renderer proof, which kept the project in renderer-test mode.
- Fix required in V8:
  - Build public renderer APIs and developer workflows first-class.
  - Make app startup, asset loading, render loop, controls, and example routes production behavior, not afterthoughts.
  - Keep screenshot gates, but make them secondary to working interactive apps and same-scene comparison.

### docs/project/v2-roadmap-product-asset-pipeline-plan.md Mistakes

- Mistake: Correctly rejected weak screenshots, but narrowed into product-studio work without closing renderer quality gaps.
- Mistake: Generated product workflows without a strong enough underlying PBR/HDR/IBL and asset pipeline.
- Mistake: Treated "real product workflow" as mostly one app rather than the reusable renderer SDK developers need.
- Fix required in V8:
  - Product Studio must consume stable A3D APIs.
  - Asset quality, HDR environments, material controls, camera controls, and screenshot export must be reusable across apps.
  - Product app code must not hide renderer limitations.

### docs/project/v3-roadmap-product-workflow-plan.md Mistakes

- Mistake: Expanded the ambition to "Three.js competitor" without enough enforceable implementation gates.
- Mistake: Defined many pillars but did not force each feature to become a fast-loading, visually credible browser route.
- Mistake: Allowed progress files, readiness scripts, and package surfaces to outrun visible quality.
- Fix required in V8:
  - Every major feature must have a production API, a dedicated example, browser verification, and same-scene reference where applicable.
  - No milestone can close if its browser route is blank, slow, static, or ugly.

### docs/project/v4-roadmap-visual-engine-plan.md Mistakes

- Mistake: Added visual quality, real assets, pro apps, and Three.js parity language, but still permitted broad app proliferation before one route became undeniable.
- Mistake: Let pro app names imply maturity when the output still looked like demo scenes.
- Mistake: Allowed visual proof to be assembled from app-specific code instead of an underlying renderer product.
- Fix required in V8:
  - Fewer apps, deeper quality.
  - One flagship viewer and one animation suite must become excellent before galleries expand.
  - App code must shrink because renderer/assets/controls packages carry the real implementation.

### docs/project/three-compat-roadmap-visual-engine-plan.md Mistakes

- Mistake: Claimed a broad replacement track too early.
- Mistake: Built a large list of Three.js replacement areas without first clearing core renderer fidelity and example quality.
- Mistake: Mixed legacy prune work, compatibility work, visual gallery work, and broad replacement claims into one reset.
- Mistake: Left old, weak, or deleted legacy files as confusing evidence.
- Fix required in V8:
  - Keep broad replacement as a target, but gate it by exact feature parity and visual comparison.
  - Delete/quarantine legacy files that are no longer product routes.
  - Create a strict package/source cleanliness check that fails on obsolete EngineReadiness-era demo leftovers.

### docs/project/production-runtime-roadmap-production-renderer-plan.md Mistakes

- Mistake: Correctly demanded production GLTF/HDR/PBR renderer parity, but still accepted proof scenes that looked like Lambert/gray-box/debug outputs.
- Mistake: Generated screenshots that were higher resolution than prior work but not high-fidelity enough.
- Mistake: Produced gallery/product routes that could be blank, slow, static, or visually weak.
- Mistake: Treated renderer proof and screenshot metrics as a substitute for user-visible product quality.
- Fix required in V8:
  - Fix renderer startup and render-loop performance before any new proof.
  - Replace readback-heavy startup paths.
  - Use real animation/asset scenes that are visually comparable to Three.js examples.
  - Add human-visual review gates that can fail a technically nonblank screenshot.

### docs/project/v7-roadmap-runtime-parity-plan.md Mistakes

- Mistake: Correctly clarified that A3D is a competitor, not a Three.js wrapper, but still produced weak or slow app evidence.
- Mistake: The V7 parity lab tried to cover too many categories in one route and became too slow to load.
- Mistake: The V7 animation route could display "Running" while still showing `loading`, `0 frames`, and a blank viewport.
- Mistake: The V6 character viewer was still too slow and visually weak.
- Mistake: A root URL was missing until after user-visible failure.
- Fix required in V8:
  - Split parity lab into dedicated, fast, focused apps.
  - Add startup budgets and route health gates.
  - A page cannot say "Running" until it has loaded an asset, rendered at least one nonblank frame, and advanced animation state.
  - Root index, route registry, and live example smoke tests are required infrastructure.

## Current Failures V8 Must Start With

These failures are known and must be fixed before new feature work.

### Failure 1: V7 Animation Route Can Show Blank Loading State

Observed:

- URL: `http://localhost:5180/apps/regression-animation-keyframes/`
- UI says `Running`.
- Metrics show `loading`, `loading clip`, `0 frames`, `0 fps`, `0 draw calls`.
- Viewport is blank.

Required behavior:

- The app must display a truthful loading state while loading.
- The app must not show "Running" until rendering has started.
- The app must show visible progress or error within 2 seconds.
- The app must reach first rendered frame within 5 seconds on the local dev machine.
- If asset/HDR/shader loading fails, the error must be visible in the UI and in `window.__a3dV7AnimationKeyframes`.

### Failure 2: V6 Character Viewer Loads Too Slowly

Observed:

- URL: `http://localhost:5180/apps/character-viewer/`
- Route can become usable only after a long delay.
- Startup path uses proof/readback-heavy behavior that is not appropriate for an interactive app.

Required behavior:

- First contentful app shell under 500 ms after Vite serves JS.
- First WebGL frame under 5 seconds.
- No startup `readPixels` unless user explicitly clicks capture/export.
- No proof-generation path in normal interactive startup.

### Failure 3: V7 Example Parity Lab Is Too Heavy

Observed:

- URL: `http://localhost:5180/apps/example-parity-lab/`
- It attempts too many features in one page.
- It can take tens of seconds to reach ready.
- It is not acceptable as a user-facing proof.

Required behavior:

- Delete it from the root "working examples" list until rebuilt.
- Split into separate fast routes by feature category.
- Keep any all-up lab as an internal stress test only.

### Failure 4: Physics Example Is A Debug Block Demo

Observed:

- `examples/physics-sandbox/` is visually a block stack/debug sandbox.
- It does not compete with a polished physics/animation example.

Required behavior:

- Keep it as a debug sandbox if useful.
- Do not present it as Three.js/engine-quality proof.
- Build new visual physics demos with real assets, controls, contacts, constraints, and polished rendering.

### Failure 5: Visual Quality Still Does Not Read As High-End PBR/HDR

Observed:

- Many outputs look flat, gray, low-detail, under-composed, or debug-like.
- Higher PNG resolution did not solve weak material/lighting/composition.

Required behavior:

- Improve BRDF, IBL/PMREM, shadows, tone mapping, asset quality, and composition.
- Use real HDR environments as visible lighting and reflection sources.
- Make the asset fill the frame and reveal material detail.
- Human visual review can fail a screenshot even if metrics pass.

## V8 Objective

V8 must produce a real A3D renderer product, not another reset plan.

The target product is:

> A3D Renderer SDK: a A3D-only WebGL2/WebGPU real-time renderer and developer SDK with GLTF-first asset loading, high-fidelity PBR/HDR/IBL rendering, animation/skinning/morph/IK workflows, physics integration, postprocess, controls, scene composition, examples, templates, docs, and same-scene competitor comparisons against Three.js.

V8 must create the missing product depth by filename.

## Product Completion Bar

A3D does not need to beat every part of Three.js in one pass, but it must make measurable progress toward exceeding Three.js in these areas:

- Better default GLTF/HDR/PBR viewer setup.
- Better one-call production scene setup.
- Better diagnostics for unsupported GLTF/material/animation features.
- Better developer workflow for loading an asset, choosing an HDRI, orbiting, inspecting materials, adjusting exposure, and exporting.
- Better product-specific examples with curated controls and route health.
- Honest same-scene comparison against Three.js.

Do not claim "A3D exceeds Three.js" globally until the gates below are actually green.

## Required Global Acceptance Gates

V8 is not complete unless all gates pass.

- [x] `http://localhost:5180/` loads a route index with no 404.
- [x] Every linked route on the root index reaches `ready` or visible `error` within 5 seconds.
- [x] No linked route can show "Running" while still at zero frames.
- [x] Normal app startup does not call `readPixels`.
- [ ] Capture/export buttons may call `readPixels`, but only on user action or explicit test capture.
- [ ] V7 animation keyframes route visibly animates a high-quality imported GLB.
- [ ] V6 character viewer either becomes fast and polished or is removed from working examples.
- [x] V7 parity lab is split into dedicated routes or moved to internal stress-test status.
- [ ] Same-scene Three.js comparison exists for flagship product viewer and at least three official Three.js example categories.
- [x] A3D runtime packages do not import `three`.
- [x] Screenshots are not accepted if they are blank, gray-boxed, tiny-subject, debug-like, or visually below the stated bar.
- [x] Docs state current gaps honestly.

## Filename-Level Work: Start Here

Do this work in order. Do not add new gallery screenshots until Phase 1 through Phase 4 are green.

## Phase 1: Route Health, Startup, And Truthful Loading

### `index.html`

Current status:

- Added only as a simple local route index.

Tasks:

- [x] Convert root index into a generated route registry consumer.
- [x] Show only routes that pass health checks.
- [x] Add status labels: `working`, `slow`, `internal`, `blocked`.
- [x] Do not link `apps/example-parity-lab/` as working until it passes startup gates.

Acceptance:

- [x] `curl -I http://localhost:5180/` returns `200`.
- [x] Browser route test confirms all links exist.
- [x] Root page cannot list a route as working unless route health JSON marks it working.

### `apps/regression-animation-keyframes/src/main.ts`

Current failure:

- Can show `Running` while app is still loading.
- Can remain blank with zero frames.
- Uses expensive startup work and weak fallback/error surfacing.

Tasks:

- [x] Split runtime states into `booting`, `loading-assets`, `compiling-renderer`, `first-frame`, `running`, `error`.
- [x] Replace static "Running" button text with state-driven text.
- [x] Add visible progress text for HDR fetch, GLB fetch, GLTF parse, texture upload, shader compile, first frame.
- [x] Add timeout guard: if no first frame in 5 seconds, show visible warning with current loading step.
- [x] Add error panel that prints the actual failed URL or thrown stack.
- [x] Defer HDR environment loading behind first render if HDR blocks first frame.
- [x] Render a fast fallback lit character/material preview before heavy HDR resources finish.
- [x] Do not call screenshot proof or readback code during normal startup.
- [x] Keep `window.__a3dV7AnimationKeyframes` updated every state transition.

Acceptance:

- [x] `tests/browser/current-routes-runtime-parity-animation-route-health.spec.ts` proves first visible state under 500 ms.
- [x] First nonblank WebGL frame under 5 seconds.
- [x] After ready, `frameCount > 10`, `drawCalls > 0`, `clipName` is not loading text.
- [x] Blank viewport while `status === running` fails the test.

### `apps/regression-animation-keyframes/index.html`

Tasks:

- [x] Keep canvas visible during loading.
- [x] Add accessible app container that does not imply success before first frame.
- [x] Ensure route loads from root index and direct URL.

Acceptance:

- [x] Browser reload from direct route succeeds.
- [x] No root-relative asset path 404s.

### `apps/common/src/runtime.ts`

Current failure:

- Shared V6 runtime uses proof/readback-oriented startup behavior.
- `renderImportedAsset()` can run during interactive app startup and trigger readback stalls.

Tasks:

- [x] Separate interactive render startup from proof capture.
- [x] Add `runV6InteractiveApp()` that uses `renderer.renderFrame()` only.
- [ ] Move `renderer.renderImportedAsset()` into explicit `captureProof()` or test-only helper.
- [x] Remove automatic `readPixels` from normal V6 app startup.
- [x] Add lifecycle states: `loading`, `first-frame`, `ready`, `error`.
- [x] Add per-stage timing diagnostics: JS load, asset fetch, GLTF parse, texture upload, renderer create, first frame.
- [x] Add route timeout handling and visible errors.
- [x] Ensure animation loops are started only after first frame resources exist.
- [x] Ensure `requestAnimationFrame` loop is canceled on hot reload/dispose.

Acceptance:

- [x] `apps/character-viewer/` reaches first frame under 5 seconds.
- [x] Browser console has no `GPU stall due to ReadPixels` during startup.
- [x] Readback only happens after capture/export actions or explicit proof tests.

### `apps/character-viewer/src/main.ts`

Tasks:

- [x] Use new interactive runtime, not proof runtime.
- [x] Add route-local error boundary.
- [ ] Add clip selection UI only after clips are loaded.
- [ ] Add play/pause/scrub controls that update the real animation mixer.

Acceptance:

- [x] Viewer visibly animates without user clicking.
- [ ] User can pause and scrub.
- [ ] Metrics reflect real frames and clip time.

### `apps/character-viewer/src/assets.ts`

Tasks:

- [ ] Replace weak placeholder character with a higher-quality licensed local GLB asset.
- [ ] Keep Cesium Man only as low-end compatibility fixture, not flagship visual.
- [ ] Add at least one high-quality skinned character with multiple clips.

Acceptance:

- [ ] Metadata shows `animationCount >= 3` and `skinCount >= 1` for flagship character.
- [ ] Character has real texture/material detail, not a flat cartoon placeholder.

### `apps/character-viewer/src/scene.ts`

Tasks:

- [x] Frame character at human-readable scale.
- [ ] Use a polished environment, not gray wall/floor defaults.
- [ ] Add ground contact shadow or proper shadow.
- [ ] Ensure the subject fills the frame.

Acceptance:

- [ ] Screenshot shows character detail clearly.
- [ ] Scene does not look like a debug room.

## Phase 2: App Split, Route Registry, And Slow Route Removal

### `apps/example-parity-lab/src/main.ts`

Current failure:

- Too many features in one app.
- Slow route, large assets, proof/render readbacks, and stress-test behavior mixed with user-facing proof.

Tasks:

- [x] Stop treating this as a working public example.
- [ ] Convert to internal stress lab or delete after extracting useful code.
- [x] Remove from root working links.
- [x] Extract feature slices into dedicated apps listed below.

Acceptance:

- [x] Root index marks it `internal` or omits it.
- [x] No docs call it final parity proof.

### `apps/animation-keyframes/`

Create:

- [x] `apps/animation-keyframes/index.html`
- [x] `apps/animation-keyframes/src/main.ts`
- [x] `apps/animation-keyframes/src/state.ts`
- [x] `apps/animation-keyframes/src/scene.ts`
- [x] `apps/animation-keyframes/src/ui.ts`

Tasks:

- [ ] Build a A3D-only competitor to Three.js `webgl_animation_keyframes`.
- [ ] Use a high-quality animated scene asset with moving environment/object detail, not a single mannequin in a gray room.
- [x] Support play/pause/speed/scrub/camera orbit.
- [x] Show first frame quickly, then progressively load higher-quality resources.

Acceptance:

- [ ] Same category comparison page links to `https://threejs.org/examples/#webgl_animation_keyframes`.
- [x] A3D route first frame under 5 seconds.
- [x] Visual output is not blank, gray-boxed, or placeholder-like.

### `apps/skinning-blending/`

Create:

- [x] `apps/skinning-blending/index.html`
- [x] `apps/skinning-blending/src/main.ts`
- [x] `apps/skinning-blending/src/blendController.ts`
- [x] `apps/skinning-blending/src/ui.ts`

Tasks:

- [ ] Build A3D competitor to Three.js `webgl_animation_skinning_blending`.
- [x] Implement idle/walk/run blend controls.
- [x] Display clip weights and current blended pose.
- [x] Use A3D animation mixer only.

Acceptance:

- [x] User can blend clips live.
- [x] No static sampled-pose proof counts.

### `apps/skinning-additive/`

Create:

- [x] `apps/skinning-additive/index.html`
- [x] `apps/skinning-additive/src/main.ts`
- [x] `apps/skinning-additive/src/additiveLayers.ts`

Tasks:

- [ ] Build A3D competitor to Three.js `webgl_animation_skinning_additive_blending`.
- [x] Add upper-body additive layer support.
- [x] Support masks/layers and visible UI weights.

Acceptance:

- [x] Additive layer visibly changes pose over base locomotion.
- [ ] Layer mask behavior is tested.

### `apps/skinning-ik/`

Create:

- [x] `apps/skinning-ik/index.html`
- [x] `apps/skinning-ik/src/main.ts`
- [x] `apps/skinning-ik/src/ikTargets.ts`
- [x] `apps/skinning-ik/src/ui.ts`

Tasks:

- [ ] Build A3D competitor to Three.js `webgl_animation_skinning_ik`.
- [x] Render draggable IK target handles.
- [ ] Apply IK to imported skeleton.
- [x] Show target/reach diagnostics without debug clutter.

Acceptance:

- [ ] Moving target changes imported skinned pose.
- [x] IK solve result and end-effector distance are visible in UI.

### `apps/skinning-morph/`

Create:

- [x] `apps/skinning-morph/index.html`
- [x] `apps/skinning-morph/src/main.ts`
- [x] `apps/skinning-morph/src/morphControls.ts`

Tasks:

- [ ] Build A3D competitor to Three.js `webgl_animation_skinning_morph`.
- [ ] Use a high-quality morph/face/character asset.
- [x] Support morph target sliders and animated morph clips.

Acceptance:

- [x] Morph changes are visible and not just cube deformation.

### `apps/animation-multiple/`

Create:

- [x] `apps/animation-multiple/index.html`
- [x] `apps/animation-multiple/src/main.ts`
- [x] `apps/animation-multiple/src/agentSpawner.ts`

Tasks:

- [ ] Build A3D competitor to Three.js `webgl_animation_multiple`.
- [x] Render multiple animated characters/agents with varied animation offsets.
- [ ] Use instancing or batching where appropriate.

Acceptance:

- [x] At least 20 animated agents.
- [x] Route remains interactive.

### `apps/animation-walk/`

Create:

- [x] `apps/animation-walk/index.html`
- [x] `apps/animation-walk/src/main.ts`
- [x] `apps/animation-walk/src/locomotion.ts`

Tasks:

- [ ] Build A3D competitor to Three.js `webgl_animation_walk`.
- [x] Support root motion or scene movement.
- [x] Add simple ground/path composition.

Acceptance:

- [x] Character visibly walks through scene, not in-place only unless toggle selected.

### `apps/decals/`

Create:

- [x] `apps/decals/index.html`
- [x] `apps/decals/src/main.ts`
- [x] `apps/decals/src/decalPlacement.ts`

Tasks:

- [ ] Build A3D competitor to Three.js `webgl_decals`.
- [ ] Raycast onto imported mesh.
- [x] Place decals interactively.
- [ ] Decals must conform to surface and use correct material blending.

Acceptance:

- [ ] Click adds visible decal on imported asset.
- [x] Decal placement uses A3D geometry, raycast, and material code.

### `apps/stereo-effects/`

Create:

- [x] `apps/stereo-effects/index.html`
- [x] `apps/stereo-effects/src/main.ts`
- [x] `apps/stereo-effects/src/stereoControls.ts`

Tasks:

- [x] Build A3D competitor to Three.js `webgl_effects_stereo`.
- [x] Implement stereo camera rig controls.
- [x] Add side-by-side and anaglyph/parallax where feasible.

Acceptance:

- [x] Left/right views visibly differ.
- [ ] Camera rig math is tested.

### `apps/physics-showcase/`

Create:

- [x] `apps/physics-showcase/index.html`
- [x] `apps/physics-showcase/src/main.ts`
- [x] `apps/physics-showcase/src/physicsScene.ts`
- [x] `apps/physics-showcase/src/controls.ts`

Tasks:

- [ ] Replace block-only debug proof with a visually credible physics scene.
- [x] Use real rendered assets, rigid bodies, constraints, raycast interaction, and contact feedback.
- [x] Keep debug overlay optional, off by default.

Acceptance:

- [x] Looks like a physics product example, not a unit-test harness.

## Phase 3: Renderer Startup And Performance Work

### `packages/rendering/src/production-runtime/ProductionWebGL2Renderer.ts`

Current failure:

- `renderImportedAsset()` is useful for proof but wrong for interactive startup because it reads pixels.

Tasks:

- [x] Add `renderInteractiveFrame(input)` or make `renderFrame()` the documented interactive path.
- [x] Add `captureProof(input)` as an explicit readback path.
- [x] Ensure app runtimes call only interactive path during startup and animation.
- [x] Add timing diagnostics for render stages without readback.

Acceptance:

- [x] Interactive route tests show no `readPixels` warning during startup.

### `packages/rendering/src/Renderer.ts`

Tasks:

- [ ] Profile and reduce per-frame allocations in `render()`.
- [ ] Avoid recreating passes/pipelines unnecessarily.
- [ ] Add an optional persistent frame graph or pass cache for animated scenes.
- [ ] Add renderer timing hooks: collect items, shadow pass, forward pass, postprocess, present.
- [ ] Add explicit `disposeFrameResources()` behavior for hot reload.

Acceptance:

- [ ] Animated skinned route has stable frame cadence after first frame.
- [ ] Timing diagnostics identify slow stage.

### `packages/rendering/src/ForwardPass.ts`

Known recent fix:

- Shared shader module cache was added to reduce avoidable shader setup.

Tasks:

- [x] Formalize shader cache tests.
- [ ] Cache render pipeline or draw command layout where safe.
- [x] Reduce `Array.from` usage in hot paths.
- [ ] Avoid per-item material binding allocations where possible.
- [ ] Optimize skinning uniform upload path.
- [ ] Add GPU skinning texture/UBO fallback strategy if uniform limits or upload cost become blockers.

Acceptance:

- [x] `tests/unit/rendering/current-routes-forward-pass-cache.test.ts`.
- [x] Browser animation perf test shows no per-frame shader compile.

### `packages/rendering/src/WebGL2Device.ts`

Known recent fix:

- Uniform location cache and uniform upload allocation reduction were added.

Tasks:

- [x] Add tests proving uniform location cache is used.
- [x] Add optional debug counters for shader program creation, uniform location lookups, buffer updates, texture binds, draw calls.
- [x] Avoid redundant sampler parameter uploads every draw where possible.
- [x] Avoid redundant texture binds when texture unit state is unchanged.
- [x] Add `readPixels` warning integration so startup tests can fail if readback happens.

Acceptance:

- [x] `tests/unit/rendering/current-routes-webgl2-hot-path.test.ts`.
- [x] Browser tests fail if startup emits `GPU stall due to ReadPixels`.

### `packages/rendering/src/IndexBuffer.ts`

Known recent fix:

- Stopped re-uploading static index buffers on every draw.

Tasks:

- [x] Add unit test for upload-once behavior.
- [ ] Add dirty/update path for dynamic index buffers if needed.
- [ ] Make static/dynamic intent explicit.

Acceptance:

- [x] Static index buffers do not call `updateBuffer` after first upload.

### `packages/rendering/src/VertexBuffer.ts`

Tasks:

- [x] Audit whether vertex buffers re-upload every frame.
- [ ] Add static/dynamic upload distinction.
- [ ] Add dirty range updates for animated CPU geometry only.

Acceptance:

- [x] Static GLTF geometry uploads once.

### `packages/rendering/src/MaterialBinding.ts`

Tasks:

- [ ] Cache successful material/shader binding layouts.
- [ ] Avoid repeated validation cost in release/normal render path.
- [ ] Keep validation available in debug mode.

Acceptance:

- [ ] Material validation does not dominate animated frame timings.

## Phase 4: Asset Pipeline And High-Quality Local Corpus

### `fixtures/threejs-parity/assets/manifest.json`

Create:

- [x] Asset manifest with license/source/feature tags.
- [x] Include high-quality local assets for:
  - product viewer
  - animated character
  - keyframes scene
  - morph character
  - decal target mesh
  - physics showcase assets
  - interior/architecture scene

Acceptance:

- [x] Every asset has source, license, triangle count, textures, animations, skins/morphs, material extensions.

### `tools/current-routes-asset-fetch/index.ts`

Create:

- [x] Fetch or validate approved public assets.
- [x] Do not fetch at app runtime.
- [x] Store assets locally under `fixtures/threejs-parity/assets/**`.
- [x] Verify checksums.

Acceptance:

- [x] `pnpm v8:assets` creates/verifies corpus.

### `packages/assets/src/GLTFLoader.ts`

Tasks:

- [x] Audit support for skins, inverse bind matrices, animation samplers, interpolation, morph weights, texture transforms, material variants, normal/ORM/emissive textures.
- [x] Add failure diagnostics for unsupported features.
- [x] Ensure no asset failure silently produces blank output.

Acceptance:

- [x] `tests/assets/current-routes-gltf-loader-corpus.test.ts`.

### `packages/assets/src/GLTFAnimationRuntime.ts`

Tasks:

- [ ] Support continuous playback, blend, additive blend, root motion, morph weights, and IK integration for imported GLTF.
- [x] Unit evidence covers continuous playback, clip blending, additive blending, morph-weight application, and skinning palette updates for imported GLB clips.
- [x] Add efficient scene target binding cache.
- [x] Avoid per-frame target lookup.
- [x] Expose runtime diagnostics for missing tracks and unsupported interpolation.

Acceptance:

- [x] `tests/assets/current-routes-gltf-animation-runtime.test.ts`.
- [x] Browser tests prove continuous animation, not sampled static pose.

### `packages/assets/src/loadRenderableAsset.ts`

Tasks:

- [x] Provide public one-call asset load for viewer apps.
- [ ] Return renderable scene, bounds, animations, materials, textures, warnings.
- [ ] Support progressive load status callbacks.

Acceptance:

- [ ] Used by flagship app instead of app-specific loader plumbing.

## Phase 5: PBR/HDR/IBL Fidelity

### `packages/rendering/src/production-runtime/PBRHDRPipeline.ts`

Tasks:

- [ ] Make HDR environment pipeline product code, not proof code.
- [x] Provide environment rotation, exposure, background blur, intensity, specular intensity.
- [x] Surface PMREM/pre-filter diagnostics.
- [x] Bind cube PMREM mip count into runtime lighting instead of equirectangular fallback mip count.

Acceptance:

- [ ] Same asset under two HDRIs shows visibly different reflections and exposure.

### `packages/rendering/src/production-runtime/environment/PMREMGenerator.ts`

Tasks:

- [x] Audit PMREM correctness against known references.
- [x] Ensure roughness mip selection works in PBR shader.
- [ ] Add visible roughness/reflection test.

Acceptance:

- [x] `tests/unit/rendering/current-routes-pmrem.test.ts`.
- [ ] Browser material matrix shows roughness-dependent environment reflection.

### `packages/rendering/src/shaders/pbr-direct.frag.glsl`

Tasks:

- [ ] Audit metal/roughness BRDF.
- [ ] Correct color space handling.
- [ ] Ensure normal map, ORM, emissive, clearcoat, sheen, specular, transmission/volume fallbacks are coherent.
- [x] Fix imported `KHR_materials_transmission` glass so it blends instead of depth-writing as opaque white over underlying texture detail.
- [ ] Ensure IBL diffuse/specular are visibly used.
- [ ] Avoid Lambert-like fallback unless material is explicitly simple/unlit.

Acceptance:

- [ ] Material reference scene visually differentiates metal, rough plastic, clearcoat, sheen, emissive, glass/transmission where supported.

### `packages/rendering/src/TexturedPBRMaterial.ts`

Tasks:

- [x] Normalize texture slots and transforms.
- [x] Add material extension parameters.
- [x] Ensure sampler/color-space metadata is correct.
- [x] Pass GLTF clearcoat, transmission, diffuse transmission, volume, specular, sheen, anisotropy, and iridescence textures into `TexturedPBRMaterial` before shader variant selection.

Acceptance:

- [ ] GLTF materials display texture detail without washed-out/flat response.

### `packages/rendering/src/PBRMaterial.ts`

Tasks:

- [ ] Add physically meaningful defaults.
- [ ] Remove hidden emissive/self-lit defaults.
- [ ] Add public knobs for material inspector.

Acceptance:

- [ ] Material inspector app can edit parameters live.

### `packages/rendering/src/EnvironmentMapResources.ts`

Tasks:

- [ ] Ensure HDR and cube/equirect paths are unified.
- [ ] Add skybox/background resources for product viewer.
- [ ] Avoid flat wall pretending to be environment.

Acceptance:

- [ ] Flagship viewer renders visible HDR background/skybox.

## Phase 6: Shadows, Contact, Postprocess, And Composition

### `packages/rendering/src/ShadowPass.ts`

Tasks:

- [ ] Confirm directional shadow path works with imported GLTF.
- [ ] Add soft PCF controls.
- [ ] Add shadow camera fitting for asset bounds.

Acceptance:

- [ ] Product viewer has believable grounding shadow.

### `packages/rendering/src/production-runtime/passes/ContactShadowPass.ts`

Tasks:

- [ ] Integrate contact shadows into viewer apps.
- [ ] Keep parameters controlled and documented.

Acceptance:

- [ ] Contact shadow improves grounding without debug artifacts.

### `packages/rendering/src/PostProcessPass.ts`

Tasks:

- [ ] Optimize startup so postprocess resources are not blocking first frame unnecessarily.
- [ ] Provide ACES/filmic, bloom, FXAA/TAA where supported, color grade, sharpening.
- [ ] Make postprocess controls reusable.

Acceptance:

- [ ] Toggling postprocess visibly changes output.
- [ ] No readback-based postprocess in normal runtime.

### `packages/rendering/src/ToneMapping.ts`

Tasks:

- [ ] Centralize tone mapping operators.
- [ ] Match shader and CPU reference behavior.
- [ ] Document exposure/white point defaults.

Acceptance:

- [ ] Same-scene comparison uses declared tone mapping target.

## Phase 7: Controls, Camera, And Developer Ergonomics

### `packages/controls/src/OrbitControls.ts`

Tasks:

- [ ] Build production orbit controls independent of Three.js.
- [ ] Support damping, pan, zoom, target, min/max distance, polar limits.
- [ ] Expose dispose/update lifecycle.

Acceptance:

- [ ] All flagship viewer routes use this package.

### `packages/controls/src/CameraRig.ts`

Create:

- [ ] Camera framing helpers.
- [ ] Product preset cameras.
- [ ] Stereo camera helper integration.

Acceptance:

- [ ] Viewer can reset to hero/front/detail cameras.

### `packages/rendering/src/CameraFraming.ts`

Tasks:

- [x] Ensure imported assets fill frame.
- [x] Add subject coverage metrics.
- [x] Fail screenshots where subject coverage is too low.

Acceptance:

- [x] No flagship screenshot has tiny asset in huge empty scene.

## Phase 8: Public SDK Surface

### `packages/engine/src/threejs-example-parity/index.ts`

Create:

- [x] Public v8 SDK entrypoint.
- [ ] Export renderer, asset loader, controls, animation, environment, material inspector helpers.
- [ ] Do not export internal proof harnesses as product API.

Acceptance:

- [ ] Example apps import from `@aura3d/engine/v8` or package-level stable exports.

### `packages/rendering/src/threejs-example-parity/RendererV8.ts`

Create:

- [ ] High-level renderer facade.
- [ ] `createRenderer({ canvas, backend })`.
- [ ] `loadScene({ gltf, environment })`.
- [ ] `render(scene, camera)`.
- [ ] `captureScreenshot()`.

Acceptance:

- [ ] Flagship viewer has minimal setup code.

### `packages/assets/src/threejs-example-parity/loadGltfScene.ts`

Create:

- [ ] GLTF-first load function.
- [ ] Status callbacks.
- [ ] Render resources.
- [ ] Animation clips and material metadata.

Acceptance:

- [ ] Used by v8 apps.

### `packages/environments/src/threejs-example-parity/loadEnvironment.ts`

Create:

- [ ] HDR environment loader.
- [ ] PMREM resource creation.
- [ ] Background/skybox resources.

Acceptance:

- [ ] Used by flagship viewer and examples.

## Phase 9: Flagship Viewer Product

### `apps/flagship-viewer/index.html`

Create:

- [x] Main product route for V8.
- [x] Must load quickly and progressively.

### `apps/flagship-viewer/src/main.ts`

Tasks:

- [x] Use public v8 SDK.
- [x] Load real GLB and HDRI.
- [x] Start interactive render loop.
- [x] Show loading and errors truthfully.
- [x] No startup proof/readback.

Acceptance:

- [x] First frame under 5 seconds.
- [x] Interactive orbit immediately after ready.

### `apps/flagship-viewer/src/ViewerState.ts`

Tasks:

- [x] Asset selection.
- [x] Environment selection.
- [x] Exposure/tone mapping.
- [x] Material selection.
- [x] Camera preset.
- [x] Screenshot capture state.

### `apps/flagship-viewer/src/ViewerControls.ts`

Tasks:

- [x] Orbit controls.
- [x] Environment controls.
- [x] Material controls.
- [ ] Animation controls if asset has clips.
- [x] Capture/export button.

### `apps/flagship-viewer/src/ViewerScene.ts`

Tasks:

- [x] Build polished scene from SDK.
- [x] Ground/contact shadow.
- [x] HDR background.
- [x] Product lighting presets.
- [x] No debug boxes by default.

### `apps/flagship-viewer/src/ViewerDiagnostics.ts`

Tasks:

- [x] Show warnings, unsupported features, GPU backend, frame timing.
- [x] Keep diagnostics in side panel, not over viewport.

Acceptance:

- [x] Viewer looks like a real product, not a proof harness.

## Phase 10: Same-Scene Three.js Competitor Baselines

### `benchmarks/threejs/src/scenes/flagship-viewer.ts`

Create:

- [x] Three.js version of flagship scene.
- [x] Same GLB.
- [x] Same HDRI.
- [x] Same camera.
- [x] Same target resolution.

### `benchmarks/aura3d/src/scenes/flagship-viewer.ts`

Create:

- [x] A3D version using public v8 SDK.

### `tools/current-routes-threejs-parity/index.ts`

Create:

- [x] Run A3D and Three.js same-scene captures.
- [x] Generate side-by-side page.
- [x] Generate deltas and human notes.

### `tests/browser/current-routes-threejs-parity.spec.ts`

Create:

- [x] Capture A3D output.
- [x] Capture Three.js output.
- [x] Assert both nonblank.
- [x] Assert both loaded same asset and HDRI.
- [x] Assert no A3D runtime imports Three.js.
- [x] Fail if flagship mean RGB delta is above 55 or structural similarity proxy is below 0.8.

Acceptance:

- [x] Report states exact deltas, not fake equality.
- [x] Side-by-side comparison no longer accepts the earlier blown-out/opaque-glass watch render.

### `tools/current-routes-runtime-import-audit/index.ts`

Create:

- [x] Scan production A3D runtime, renderer, loader, animation, physics, engine, and user-facing V6/V7/V8 app source roots.
- [x] Fail on `three`, `three/*`, or `@aura3d/three-compat` imports in product/runtime paths.
- [x] Allow Three.js only in isolated comparison harnesses, tools, tests, benchmarks, docs, and the explicit `packages/three-compat/**` boundary.

Acceptance:

- [x] `pnpm v8:no-three-runtime`.
- [x] `tests/reports/current-routes-runtime-import-audit.json`.

## Phase 11: Visual Quality Gates That Cannot Be Gamed

### `tools/current-routes-route-health/index.ts`

Create:

- [x] Visit every route in route registry.
- [x] Record load time, first frame time, ready time, error text, console errors.
- [x] Fail slow or blank routes.

### `tools/current-routes-visual-review/index.ts`

Create:

- [x] Reject blank, flat, debug, gray-box, tiny-subject, low-detail screenshots.
- [x] Check subject coverage.
- [x] Check edge/detail density without allowing metric gaming.
- [x] Require human visual review notes for flagship output.

### `tests/browser/current-routes-route-health.spec.ts`

Create:

- [x] Root index loads.
- [x] Every working route reaches ready under budget.
- [x] No linked route stays loading.
- [x] No working route has zero draw calls.

### `tests/browser/current-routes-flagship-viewer.spec.ts`

Create:

- [x] First frame.
- [x] Orbit control.
- [x] Environment change.
- [x] Exposure change.
- [x] Material inspect.
- [x] Screenshot export.

### `tests/browser/current-routes-animation-examples.spec.ts`

Create:

- [x] Keyframes.
- [x] Skinning blending.
- [x] Additive blending.
- [x] IK.
- [x] Morph.
- [x] Multiple animation.
- [x] Walk.

Acceptance:

- [x] Each route demonstrates visible motion and updates runtime metrics.

## Phase 12: Legacy Prune And Source Cleanliness

### `tools/current-routes-legacy-prune/index.ts`

Create:

- [x] Scan for obsolete EngineReadiness routes/screenshots/reports that are not linked to current product.
- [x] Identify files deleted or quarantined by docs/project/v4-engine-readiness-plan.md through docs/project/v7-roadmap-runtime-parity-plan.md that still exist.
- [x] Fail if old bad screenshots are used as current approval evidence.
- [x] Fail if route index links to obsolete examples.

Acceptance:

- [x] `tests/reports/current-routes-legacy-prune.json` lists deleted, quarantined, retained, and blocked files.

### `examples/_quarantine/README.md`

Tasks:

- [x] Document that quarantined examples are failed evidence or historical material only.
- [x] Do not link quarantine as product examples.

### `docs/project/v8-roadmap-legacy-prune.md`

Create:

- [x] Explain what old routes were removed, replaced, or quarantined.

## Phase 13: Package Scripts

### `package.json`

Add scripts:

```json
{
  "v8:assets": "pnpm exec tsx --tsconfig tsconfig.base.json tools/current-routes-asset-fetch/index.ts",
  "v8:typecheck": "pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false",
  "v8:route-health": "pnpm exec playwright test tests/browser/current-routes-route-health.spec.ts tests/browser/current-routes-runtime-parity-animation-route-health.spec.ts --reporter=line && pnpm exec tsx --tsconfig tsconfig.base.json tools/current-routes-route-health/index.ts",
  "v8:flagship": "pnpm exec playwright test tests/browser/current-routes-flagship-viewer.spec.ts --reporter=line",
  "v8:animation": "pnpm exec playwright test tests/browser/current-routes-animation-examples.spec.ts --reporter=line",
  "v8:threejs-parity": "pnpm exec playwright test tests/browser/current-routes-threejs-parity.spec.ts --reporter=line && pnpm exec tsx --tsconfig tsconfig.base.json tools/current-routes-threejs-parity/index.ts",
  "v8:no-three-runtime": "pnpm exec tsx --tsconfig tsconfig.base.json tools/current-routes-runtime-import-audit/index.ts",
  "v8:visual-review": "pnpm exec tsx --tsconfig tsconfig.base.json tools/current-routes-visual-review/index.ts",
  "v8:legacy-prune": "pnpm exec tsx --tsconfig tsconfig.base.json tools/current-routes-legacy-prune/index.ts",
  "v8:completion-audit": "pnpm exec tsx --tsconfig tsconfig.base.json tools/current-routes-completion-audit/index.ts",
  "v8": "pnpm v8:typecheck && pnpm v8:assets && pnpm v8:route-health && pnpm v8:flagship && pnpm v8:animation && pnpm v8:threejs-parity && pnpm v8:no-three-runtime && pnpm v8:visual-review && pnpm v8:legacy-prune && pnpm v8:completion-audit"
}
```

Acceptance:

- [x] Scripts exist.
- [x] Scripts fail honestly when visuals/routes are not ready.

## Phase 14: Docs

### `docs/project/v8-roadmap-status.md`

Create:

- [x] Current state.
- [x] Working routes.
- [x] Slow/blocked routes.
- [x] Visual quality gaps.
- [x] Three.js parity gaps.

### `docs/project/v8-roadmap-renderer-sdk.md`

Create:

- [x] Public renderer API.
- [x] Backend selection.
- [x] GLTF/HDR setup.
- [x] Render loop.
- [x] Capture/export.

### `docs/project/v8-roadmap-gltf-animation.md`

Create:

- [x] Clip playback.
- [x] Blending.
- [x] Additive layers.
- [x] Morph weights.
- [x] IK.
- [x] Known unsupported features.

### `docs/project/v8-roadmap-pbr-hdr-ibl.md`

Create:

- [x] PBR material model.
- [x] HDR environment.
- [x] PMREM.
- [x] Tone mapping.
- [x] Shadows and postprocess.

### `docs/project/v8-roadmap-threejs-comparison.md`

Create:

- [x] Explain comparison methodology.
- [x] State Three.js is competitor baseline only.
- [x] List same-scene deltas honestly.

### `docs/project/v8-roadmap-claim-boundary.md`

Create:

- [x] What A3D can claim now.
- [x] What A3D cannot claim yet.
- [x] Gates required before saying "exceeds Three.js."

## Phase 15: Final Reports

Create:

- [x] `tests/reports/current-routes-route-health.json`
- [x] `tests/reports/flagship-viewer.json`
- [x] `tests/reports/v8-animation-examples.json`
- [x] `tests/reports/current-routes-threejs-parity.json`
- [x] `tests/reports/current-routes-runtime-import-audit.json`
- [x] `tests/reports/current-routes-visual-review.json`
- [x] `tests/reports/current-routes-legacy-prune.json`
- [x] `tests/reports/current-routes-completion-audit.json`

Acceptance:

- [x] Reports are generated from code, not manually written claims.
- [x] Reports can fail.
- [x] Reports include screenshots and route timings.

## Phase 16: Final Screenshots

Required screenshots:

- [x] `tests/reports/v8/flagship/a3d-flagship-viewer.png`
- [x] `tests/reports/v8/flagship/threejs-flagship-viewer.png`
- [x] `tests/reports/v8/flagship/side-by-side.png`
- [x] `tests/reports/v8/animation/keyframes.png`
- [x] `tests/reports/v8/animation/skinning-blending.png`
- [x] `tests/reports/v8/animation/additive-blending.png`
- [x] `tests/reports/v8/animation/ik.png`
- [x] `tests/reports/v8/animation/morph.png`
- [x] `tests/reports/v8/animation/multiple.png`
- [x] `tests/reports/v8/animation/walk.png`
- [x] `tests/reports/v8/decals/decals.png`
- [x] `tests/reports/v8/stereo/stereo.png`
- [x] `tests/reports/v8/physics/physics-showcase.png`

Screenshots fail if:

- The viewport is blank.
- The main subject is tiny.
- The scene is a gray box/debug room.
- The material response looks flat/Lambert-like.
- The route is static when it claims animation.
- It relies on visible debug panels to explain the feature.

## Definition Of Done

V8 is done only when:

- [x] Root route works.
- [x] Route health gate passes.
- [x] V7 slow/blank app failures are fixed or removed from public route list.
- [x] V6 character viewer startup is fast or replaced.
- [x] Flagship viewer is interactive, polished, and uses public A3D SDK APIs.
- [x] Dedicated animation/IK/morph/decals/stereo/physics routes exist and load quickly.
- [x] Same-scene Three.js competitor comparisons exist and document deltas.
- [x] A3D runtime code imports no Three.js.
- [x] Startup app paths do not do proof/readback work.
- [x] Visual output is accepted by human review, not just metrics.
- [x] Docs state current gaps honestly.

## First Commands For The Next Agent

Run these before writing new features:

```bash
pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false
pnpm exec playwright test tests/browser/current-routes-route-health.spec.ts --reporter=line
```

If `tests/browser/current-routes-route-health.spec.ts` does not exist yet, create it first.

Then fix, in order:

1. `apps/regression-animation-keyframes/src/main.ts`
2. `apps/common/src/runtime.ts`
3. `apps/character-viewer/src/main.ts`
4. `apps/example-parity-lab/src/main.ts`
5. `tools/current-routes-route-health/index.ts`
6. `tests/browser/current-routes-route-health.spec.ts`

Do not start new screenshots until these routes behave truthfully.

## Final Rule

Do not stop after writing tests. Do not stop after generating screenshots. Do not stop after a report says "ready."

Stop only after A3D has working, fast, visually credible, A3D-only renderer examples and a flagship viewer that a developer can actually use as the start of a Three.js competitor.
