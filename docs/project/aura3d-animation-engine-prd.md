# Aura3D Animation Engine PRD

Version: 1.2 (baseline 1.1.0)
Date: 2026-06-07
Status: Active — audits the shipped 1.1.0 animation runtime and defines the 1.2 hardening scope
Baseline packages: `@aura3d/animation` 1.1.0, `@aura3d/engine-runtime` 1.1.0, `@aura3d/physics` 1.1.0, `@aura3d/scripting` 1.1.0
Source vision: `InitialPRD-Animation.md`
Companion PRD: `docs/project/aura3d-1.1-cartoon-studio-prd.md` (the cartoon/episode slice that sits on top of this animation runtime)
Verification: Every "current status" claim below was confirmed against source with file:line evidence via a six-lane deep codebase + git-history scan (animation package, engine runtime, Aura Clash arena, supporting packages, docs/tests/tools, and release history). Where the scan corrected an earlier assumption, the corrected fact is what appears here.
Primary goal: Turn Aura3D's already-real animation runtime (clip playback, mixing, state graphs, IK, retargeting, root motion, shot playback, combat world, Aura Clash arena) into a hardened, honestly-bounded, agent-usable Animation Engine — with the remaining transition/blending/layering/ragdoll/template gaps either closed or explicitly labeled as non-goals.

## Executive Summary

Aura3D 1.1.0 already ships a substantial, genuinely-working browser animation runtime. This is not a stub release. The `@aura3d/animation` package implements skeletal playback, a multi-action mixer with additive layers and bone masks, 1D/2D blend trees, a parameter-driven state machine, two-bone IK, humanoid retargeting, root-motion extraction/application, locomotion, crowd sampling, and scene/ECS bridges. The `@aura3d/engine-runtime` facade exposes `node.play(clip)`, `setAnimationPose`, a real `FrameLoop`, a runtime `AnimationController`, GLB clip extraction/application (`GLTFSceneAnimationRuntime`), shot playback (`createShotPlaybackPlan` / `sampleShotPlaybackPlan` / `applyShotPlaybackFrame` / `installShotPlayback`), and a combat world (`game.combatWorld`). The deployed Aura Clash arena (`AuraClashArenaApp.ts`, 2091 lines) drives 11 animation states per fighter off that combat world with deterministic-replay and skinning proof.

The gap is no longer "does anything animate." It is three things:

1. **Quality of motion in the deployed game.** The deployed Aura Clash arena drives animation with `TypedGLBActor.playClip(clip, time)` called once per frame (`AuraClashArenaApp.ts:1533`), with a hard `clipTime = 0` reset on state change (`:1524`). That path deliberately bypasses the richer controllers: it does not crossfade between states, does not use upper/lower-body layering (it plays one full-body clip), hard-codes hit reactions to a single `hurt`/`ko` clip, has no combo/cancel system, and KO is a static frozen pose (`Death01` clamped to 1.18s, `:163`) rather than ragdoll. Crucially, the primitives to fix all of this already exist and are tested: `AnimationMixer.crossFade` (`AnimationMixer.ts:80`), the engine `AnimationController` with per-layer weights (`agent-api/AnimationController.ts`, `registerLayerMetadata`), `AnimationStateGraph`, blend trees, and even the `fighting-game` template's existing two-layer `base` + `upper-body` config (`templates/fighting-game/src/game/fighters.ts:90`). The arena simply does not route through them. The 1.2 task is to wire the existing primitives into the arena, not to build them.

2. **Honest labeling of what is real vs. fixture.** `MotionMatchingFixtures.ts` and `SecondaryAnimationFixtures.ts` are deterministic simulators, not production motion-matching or foot-lock/spring-bone/cloth systems — and they already say so in-source. Ragdoll exists only as a physics-sandbox spawner preset, not a `RagdollController` with joint limits or animation→physics blending. Most `threejs-compatibility/*` animation classes are thin wrappers. These must be clearly bounded in docs and the public API so an agent never assumes parity that is not there.

3. **Template + reuse story.** The `fighting-game` template is source-only with pose-baked fallback clips (`templateReadiness: "source-only"`, `fighters.ts:63`); there is no dedicated character-controller scaffold; the blend tree and IK have no public "compose a locomotion controller" example. Dead/duplicate code also lingers: the legacy `packages/animation/src/Retargeting.ts` is a 30-line stub (`retargetPose` only scales translation) yet is still publicly exported from the package index; and `apps/aura-clash-showcase/src/fighters/{FighterController,FighterAI}.ts` (139 + 61 lines) are imported by nothing the deployed arena runs — only `FighterAI` imports `FighterController`, and neither reaches the route. (Note: `apps/aura-clash-showcase/src/playable/combat/AuraClashFighterController.ts` is NOT dead — it is a live proof-boundary contract asserted by the arena, and must be kept.)

Aura3D 1.2's animation goal is therefore **consolidation and believable motion**, not green-field features: make the shipped runtime's strength visible in the flagship game, close the highest-leverage motion-quality gaps, deprecate the dead/duplicate code, and lock honest claims behind a release gate.

## Product Position

The Aura3D Animation Engine should be positioned as:

- A real, browser-native, TypeScript-first skeletal animation runtime: clips, mixing, blending, state graphs, IK, retargeting, root motion, and GLB integration that actually drives motion each frame.
- An agent-usable animation API: typed clip maps, readiness validation, and shot/combat playback helpers that an AI coding agent can compose without inventing internals.
- The motion layer beneath the Cartoon Studio episode pipeline and the Aura Clash fighting game.

It must not be positioned as:

- Unity Animation Rigging, Unreal Control Rig, or Mecanim parity.
- A production motion-matching / inertialization engine (the motion-matching path is a deterministic fixture).
- A full-body IK, cloth, hair, or ragdoll-physics solution.
- A facial-animation / performance-capture system (mouth movement is viseme/blendshape cues and amplitude analysis only).

## North Star Demo

Two demos already exist and must be elevated to flagship animation proof; one new reuse demo is the 1.2 add.

1. **Aura Clash arena (deployed flagship).** `apps/aura-clash-showcase` — two rigged GLB fighters, 11 animation states each, combat world hit/block/meter, deterministic replay, skinning proof. 1.2 target: visible motion-quality upgrade (crossfade transitions, upper-body attack layering, varied hit reactions) without breaking deterministic replay.

2. **Animation runtime evidence route.** Already produces `tests/reports/animation-runtime/{named-clip-playback,clip-restart,clip-blend,animation-event-hitbox,viseme-blendshape-sync}.png` + `evidence.json`. 1.2 target: keep as the canonical "the runtime really animates" proof.

3. **Character locomotion kit (new in 1.2).** A small public, documented example composing `LocomotionController` + `BlendTree1D` (idle→walk→run) + root motion + `CharacterController` capsule + input, scaffoldable as a template. This is the missing "compose the primitives" story.

## Command Contract

The animation runtime is provable today through existing npm scripts. 1.2 adds a single aggregate gate.

```bash
# Already shipping (real)
pnpm animation-runtime:release        # unit + browser + evidence PNGs + package smoke
pnpm three-compat:animation           # three.js-compat unit + browser + readiness gate
pnpm production-runtime:animation-controls
pnpm superiority:animation-fidelity
pnpm verify:aura-clash-flagship       # apps/aura-clash-showcase flagship:gates
pnpm prompt-animation:release         # cartoon/episode animation contract + evidence

# 1.2 add
pnpm animation-engine:readiness       # aggregate gate: runs the above + honest-claims scan + dead-code gate
```

## Next Stage: Animation Studio (Product Definition)

The 1.2 scope above hardens the *engine*. The *next stage as a product* is **Animation Studio** — the authoring counterpart to Cartoon Studio. Where Cartoon Studio turns a show bible into rendered episodes, Animation Studio turns a rigged character + intent into reusable, validated, exportable character animation (locomotion, combat, gesture sets) with browser preview and evidence.

One-line definition:

> Animation Studio is a browser-native, TypeScript-first authoring template that takes a typed rigged GLB, validates its rig/clips, lets an agent or developer compose locomotion/combat/gesture state graphs with blending, IK, and root motion, previews it in a real route, and exports a reusable animation profile + evidence package.

This reuses the already-real engine (clips, mixer, blend trees, state graph, IK, retargeting, root motion, GPU skinning) — it does NOT require new core runtime. It packages those primitives into an authoring product. It must NOT claim Unity Mecanim / Unreal Control Rig / motion-matching parity.

North-star authoring demo:

> Scaffold `animation-studio`, resolve one typed rigged character, validate its clip map, compose an idle↔walk↔run locomotion state graph with crossfade + a 1D blend tree, add a two-bone foot/hand IK pass, preview it in a browser route with a skeleton overlay, and export `animation-profile.json` + a proof package — all via public `@aura3d/engine`/`@aura3d/animation` APIs.

Command contract (the deliverable to build, mirroring cartoon-studio's `episode:*`):

```bash
npx create-aura3d@latest my-anim --template animation-studio
cd my-anim
npx @aura3d/cli@latest assets resolve "rigged character" --name hero --profile animation-character
npx @aura3d/cli@latest assets validate-animation --require-clips --require-rig   # NEW cli mode
npm run anim:plan       # read character + intent -> required clip map + state graph plan
npm run anim:preview    # browser route: play state graph, blend tree, IK, skeleton overlay
npm run anim:profile    # write animation-profile.json (clip map, graph, blend params, IK chains)
npm run anim:package    # write proof package (profile + frames + motion/skinning evidence)
npm run anim:verify     # gate: clip readiness + crossfade window + skinning render + no overclaims
```

Required output package (the contract):

```text
dist/animation/<character>/
  animation-profile.json        # clip map, state graph, blend trees, IK chains, root-motion config
  rig-readiness.json            # clip/rig/mouth/bounds validation + retargeting diagnostics
  preview-frames/{idle,walk,run,blend,ik}.png
  skinning-evidence.json        # tracksApplied, skinningPalettesUpdated, joint count, rendered-pixels proof
  motion-quality.json           # per-region motion, crossfade window proof
  route-proof.json              # active state, active clip(s)+weights, errors, nonblank
  review-package.md
```

Studio authoring surface (the visual editor — currently the biggest missing piece):

- Today the editor layer (`packages/editor-runtime`) is REAL but HEADLESS (deterministic keyframe/curve/nonlinear data + command engines, tested). There is NO visual/canvas UI; `TimelineUI.ts` is an untested DOM generator.
- The next stage must add a real authoring UI: a skeleton/character viewport, a canvas timeline, a curve editor, a state-graph node view, and clip/IK inspectors — wired to the headless controllers that already exist. This is specified as a P1 deliverable below ("Animation Studio Authoring App").

## Codebase Provenance (Git History)

The animation engine was built incrementally; this is the verified release lineage (commit hashes from `git log`):

- **1.0.6 (`c554e1ed`, 2026-06-05)** — Aura Clash rebuilt from scratch: legacy `src/game-v3`/`-v4`/`-v5` apps and their fighter GLBs were deleted and replaced by the unified `src/playable/AuraClashArenaApp.ts`. `AnimationStateMachine`/`AnimationStateGraph` formalized.
- **1.0.9 (`5e1ae5f0`)** — `TypedGLBActor` introduced; player/rival rigs stabilized.
- **1.0.10 (`5094fd95`)** — Cartoon foundations + `packages/engine/src/agent-api/GameRuntime.ts` combat world + `AnimationClipRegistry`/`MotionQuality`/`HumanoidRetargeting` additions + GLB clip playback.
- **1.1.0 (`e2b42500`, tag `v1.1.0`)** — Cartoon Studio vertical slice; Aura Clash rebuilt against the 1.1 runtime (no new fighter art). Tags present: `v1.0.2`, `v1.0.10`, `v1.1.0`.
- **Post-1.1.0 (`5fa8b214`, `a8d0bf5a`)** — Cartoon Studio seek now poses the whole scene and plays real GLB clips (no T-pose).
- **Reverted (`33644b26` → `9e7be00a`)** — A directional-jump experiment was added to the **dead** `FighterController.ts` (so it never affected the deployed arena) and was reverted the same day. This is direct evidence that `FighterController.ts` is not on the live path.

## Current Codebase Audit

Honest status of every animation area at baseline 1.1.0. "Real" = genuine runtime implementation with tests/evidence. "Fixture" = deterministic simulator that self-discloses it is not production. "Stub" = thin wrapper or named-only.

| Area | Current files | Current status | 1.2 gap |
| --- | --- | --- | --- |
| Clip core | `packages/animation/src/{Keyframe,AnimationTrack,AnimationClip,AnimationClipEvents,AnimationAction,AnimationEvents}.ts` | Real. Step/linear/cubicspline interp, quaternion SLERP, loop/pingpong, event sampling across loops. | Only built-in interpolation; no custom easing curves. |
| Mixing/blending | `packages/animation/src/{AnimationMixer,AnimationLayer,BlendTree}.ts` | Real. Weighted multi-action blend, additive layers, bone masks, crossfade, 1D/2D (IDW) blend trees. | Blend trees have no public locomotion example and no editor authoring. |
| State graph | `packages/animation/src/{AnimationStateMachine,AnimationStateGraph}.ts` | Real. Conditions, priority, exit time, callbacks; `createCartoonAnimationStateGraph`. | No reusable game/locomotion state-graph preset beyond cartoon. |
| Controller (two of them) | package `packages/animation/src/AnimationController.ts` (1017 lines) + engine `packages/engine/src/agent-api/AnimationController.ts` (3339 lines) | Both real. Package controller: clip registry, crossfade (`:355`), pose capture (`:507`), events, `bindCartoonTimelineAction` (`:273`) — blends clips by weight (explicit `AnimationLayer` masks live in `AnimationMixer`). The engine controller is an INDEPENDENT reimplementation that reuses the package's types/registry (NOT a subclass or wrapper) and adds runtime node binding (`bindRuntimeNode`), per-layer weights (`registerLayerMetadata`), `registerEmbeddedGLBClips`, retargeting, and pose-baked fallbacks. | Relationship undocumented; agents must be told which to use. |
| Skinned render path | `packages/rendering/src/ShaderLibrary.ts:990` (skinned unlit/lit GLSL), `SkinnedLitMaterial.ts`/`SkinnedUnlitMaterial.ts`, `ForwardPass.ts:1495` (validates + uploads `u_jointMatrices`/`u_jointCount`, throws on contract breach), `WebGL2Device` (`uniformMatrix4fv`); fed by `GLTFAnimationRuntime.ts:646` `renderable.skinning`. | Real. Animation reaches pixels via GPU skinning (≤96 joints, 4 influences/vertex) on WebGL2. | No skinned toon/cel material (cartoon shading for rigged chars deferred); WebGPU skinning path may be incomplete (2 vs 96 joints) — verify; GPU morphs capped (4 targets/64 verts, CPU fallback); no skinned instancing. |
| Three.js compat (public) | `packages/three-compat/src/animation/*` (separate top-level package) | Real public migration layer: `AnimationMixerCompat`/`AnimationClipCompat`/`AnimationActionCompat` (play/pause/scrub/crossFadeTo)/`SkeletonCompat`/`SkinnedMeshCompat`/`MorphTargetMixerCompat`; wraps the internal `animation/src/threejs-compatibility/*` (those remain thin). Tested by `pnpm three-compat:animation`. | Docs should point three.js users here, not at the internal folder. |
| Debug instrumentation | `packages/debug/src/AnimationInspector.ts`, `SceneHelpers.ts:141` (`buildSkeletonHelper`) | Real. Mixer/skeleton snapshots, `visualEvidence` with palette hashing for regression, skeleton line viz. | — |
| Workflow demo | `packages/workflows/src/AnimationLabWorkflow.ts` (`createAnimationLabWorkflow`) | Real procedural idle/walk/run keyframe demo using native `AnimationClip`/`AnimationTrack`. | — |
| React adapter | `packages/react/src/index.ts` | Declarative scene builder only — NO animation hooks (`useAnimation`/`useFrame`/`useAnimationController` absent); animation is engine-side. | React animation hooks are a genuine gap (future work). |
| Animation editor | `packages/editor-runtime/src/{TimelineEditorController,KeyframeEditor,CurveEditor,NonlinearAnimationEditor,CartoonSceneEditor,EpisodeReviewPanel,AssetDropZone}.ts` | Real but HEADLESS: deterministic keyframe/curve (cubic Bézier) authoring, multi-sequence/nested timelines, undo/redo, route-playback binding, asset-drop validation — all tested in `editor-runtime.test.ts`. | NO visual/canvas timeline-or-curve UI; `TimelineUI.ts` is an untested DOM generator. "Editor" = data/command layer, not a visual editor. |
| GLTF scene mixer | `createGLTFSceneAnimationMixer` / `GLTFSceneAnimationMixer` (assets) | Real higher-level mixer used by the `wow-*` viewers and advanced gallery (`playExclusive`), above `GLTFSceneAnimationRuntime`. | — |
| Clip registry/validation | `packages/animation/src/AnimationClipRegistry.ts` | Real. Registration, diagnostics, `validateCartoonClipMap`. | Game/fighter clip-map validation lives in the app, not the package. |
| Root motion | `packages/animation/src/RootMotion.ts` (extract/apply); `createRootMotionWalkClip` is in `LocomotionController.ts` | Real. Loop-aware `extractRootMotion`/`applyRootMotion`; `suppressRootMotion` flag honored. | Suppressed in Aura Clash (manual position via `state.x`); deliberate but undocumented. |
| IK | `packages/animation/src/IK.ts`; assets `GLTFImportedSkeletonIKController` | Real. Analytical two-bone solver with pole vector + stretch. | No full-body IK / FABRIK / CCD (explicit non-goal). |
| Retargeting | `packages/animation/src/HumanoidRetargeting.ts` (real) + legacy `Retargeting.ts` (30-line stub) | `HumanoidRetargeting` real (`analyzeHumanoidRig`/`retargetHumanoidPose` + `analyzeCartoonHumanoidRetargeting`). `Retargeting.ts` `retargetPose` only scales translation — yet is still publicly exported from `index.ts`. | Deprecate/remove `Retargeting.ts` AND drop its public export. |
| Skeletal | `packages/animation/src/{Bone,Skeleton,Skinning}.ts` | Real. Matrix chain + GPU skinning palette. | — |
| Locomotion/crowd | `packages/animation/src/{LocomotionController,CrowdAnimation}.ts` | Real. Path follow, stride, phase-staggered crowd. | No template/kit composing it. |
| Bridges | `packages/animation/src/{SceneAnimationBridge,ECSAnimationBridge}.ts` | Real. Write pos/rot/scale/weights to node or ECS transform. | — |
| Motion matching | `packages/animation/src/MotionMatchingFixtures.ts` | Fixture. Hardcoded 18-pose DB, deterministic scoring; result carries a `claimBoundary` field (`:60`/`:112`) disclaiming inertialization/foot-lock/Unity-Unreal parity. | Stays a fixture; docs must repeat the disclaimer; never sold as real motion matching. |
| Secondary animation | `packages/animation/src/SecondaryAnimationFixtures.ts` | Fixture. Deterministic foot-IK/spring-bone telemetry; result carries `claimBoundary` (`:55`/`:91`) + `blockedClaims[]` (`:92`). | No production foot-lock/spring/cloth (explicit non-goal). |
| Three.js compat | `packages/animation/src/threejs-compatibility/*` | Mostly stub wrappers; `MorphTargetMixer` minimal-real; diagnostics fixture-backed. | Bound honestly in docs; not parity. |
| Engine runtime playback | `packages/engine/src/agent-api/{index.ts,AnimationController.ts,FrameLoop.ts,RuntimeNodeHandle.ts}` | Real. `node.play(clip)`, `setAnimationPose`, frame loop, pose capture. | — |
| GLB clip runtime | `packages/assets/src/GLTFAnimationRuntime.ts`, `GLTFLoader.ts`, `SceneLoader.ts` | Real. Extracts embedded clips, samples tracks, applies skinning/morphs. | — |
| Shot playback | `packages/engine/src/agent-api/ShotTimeline.ts` | Real. Plan/sample/apply/install; poses position/rotation/clip/mouth/visibility. | — |
| Combat world | `packages/engine/src/agent-api/GameRuntime.ts` (3,583 lines) | Real. `createCombatWorld`, `applyGameCombatEventsToRuntime` (emits VFX/camera-shake/HUD only), fighting2D rules. By design `GameCombatMove` has NO clip/animation field — clip↔state mapping is intentionally left to the app. | No shared fighter animation adapter to remove the per-app boilerplate. |
| Aura Clash arena (deployed) | `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts` (2091 lines) + `combat/auraClashMoveData.ts` + `animation/auraClashClipMaps.ts` | Real, deployed. 11 states, speed modulation (`:1529`), clip readiness, deterministic replay, skinning proof. Drives motion via `TypedGLBActor.playClip` once/frame — bypassing the engine `AnimationController`'s layers/crossfade. | No crossfade, no body layering, single `hurt`/`ko` reaction, no combos, static KO (1.18s freeze). |
| Aura Clash legacy | `apps/aura-clash-showcase/src/fighters/FighterController.ts` (139) + `FighterAI.ts` (61) | Dead. Only `FighterAI` imports `FighterController`; neither reaches the deployed route (confirmed by grep + the reverted directional-jump commit). | Remove. (Keep `playable/combat/AuraClashFighterController.ts` — it is a live proof boundary, not dead.) |
| Fighting-game template | `packages/create-aura3d/templates/fighting-game/src/game/{fighters,moves,stage}.ts` | Source-only; pose-baked fallback (`templateReadiness: "source-only"`); capsule placeholders if no GLB. | Document the fallback boundary; provide a real-asset path. |
| Character controller | `packages/physics/src/CharacterController.ts` + `createFightingCharacterController()` | Real capsule controller (ground, jump, fast-fall, crouch). | No dedicated character-controller template/kit. |
| Ragdoll | `packages/physics/src/PhysicsSandboxFixtures.ts` (`spawnRagdoll`) | Fixture/sandbox only; no controller, no joint limits, no anim blend. | Either ship a bounded `RagdollController` or label as non-goal. |
| Scripting hooks | `packages/scripting/src/{VisualGraphExecutor,CartoonVisualNodes}.ts` | Real. `onAnimationEvent`, `VisualAnimationEvent`, animation control nodes. | — |
| Animation events authoring | n/a | No timeline UI for authoring clip events. | Out of scope unless promoted. |

## Demo, Benchmark & Render-Path Surface

Beyond the packages and the Aura Clash flagship, the repo ships a large body of runnable animation evidence (verified file:line):

- **GPU skinning actually renders.** Skinned GLSL shaders at `packages/rendering/src/ShaderLibrary.ts:990-1078` blend up to 96 joint matrices (4 influences/vertex); `ForwardPass.ts:1495-1539` validates the shader/geometry skinning contract and uploads `u_jointMatrices`/`u_jointCount` (throws on violation); `GLTFAnimationRuntime.ts:623-653` recomputes the palette each frame and sets `renderable.skinning`. GPU morph targets exist but are capped (4 targets, 64 verts/batch) with CPU fallback. WebGL2 is the proven path; the WebGPU joint-upload path looked partial (2 matrices) and needs verification.
- **`wow-*` animation viewers** (real Vite apps, covered by `tests/browser/wow-showcase-screenshots.spec.ts`): `wow-soldier-animation-viewer`, `wow-robot-expressive-rig`, `wow-tokyo-keyframes`, `wow-additional-cesium-man-animation`, `wow-standard-animated-cube` — all use `createGLTFSceneAnimationMixer` + `playExclusive` (`wow-common` `gltf-showcase.ts:150,158`).
- **`apps/world-war-x-showcase`** — a SECOND combat-animation app (turn-based) with clip playback + state-driven selection.
- **`apps/advanced-examples-gallery`** — authored skinning/morph/camera animation with diagnostics; **`apps/camera-path`** — camera dolly + `timeline.loop()`.
- **Root `templates/`**: `game-slice` (uses `AnimationMixer`/`AnimationClip`/`AnimationTrack` directly + `mixer.update`/`getValue`, covered by `game-runtime-visual.spec.ts`), `mini-game` (motion-trail), `cinematic-scene` (camera dolly).
- **Benchmarks**: `benchmarks/shared/scenes/skinned-characters.ts` (32 skinned characters, looped run-cycle crowd) and `morph-characters.ts` (morph-weight sweep).

## Current Test & Gate Reality (live run, 2026-06-07)

Honesty check: I ran the suites rather than trusting report files. Status at HEAD:

- GREEN (live): `tests/unit/animation/*` — 7 files, 20 tests pass. `tests/assets/gltf-animation-runtime.test.ts` passes.
- GREEN (last recorded report run): `animation-runtime/*` (2026-06-05), `game-runtime/*` (2026-06-04), `aura3d11/*` cartoon gates (2026-06-06/07). All 6 PRD-cited gate commands exist and are spelled correctly; a parallel `pnpm game-runtime:release` suite also exists.
- FIXED in M0 (now green): `tests/unit/apps/aura-clash-arena-proof.test.ts` (now asserts the exported `AURA_CLASH_ARENA_PROOF_RELEASE` constant instead of a hard-coded `"1.0.9"`) and `tests/unit/game-runtime/runtime-node-frame-loop-source-contract.test.ts` (now matches the actual `globalThis.requestAnimationFrame` SSR-safe form). Verified green.
- Triaged out of animation-engine scope (pre-existing, documented in `known-limits.md`, NOT claimed green):
  - `tests/unit/workstream4.physics-animation.test.ts` — 9 failures, ALL physics-solver (rigid bodies/contacts/constraints/restitution), ZERO animation. The animation assertions in this file pass; the animation-engine gate runs the dedicated `tests/unit/animation/*` + `gltf-animation-runtime` suites instead.
  - `tests/reports/prompt-animation/unit.json` — refreshed this session; 14 failures remain in prompt/cartoon tooling (`prompt-source-audit`/`agent-api`), which belong to the cartoon/prompt workstream, not the animation engine.
- M0 baseline: `pnpm animation-engine:readiness` is green (25 animation/arena/frame-loop tests + dead-code gate + docs-claims gate).

## Release Pillars

1. **Real motion, proven.** Every claimed runtime capability has a unit test, a browser screenshot, or evidence JSON. No capability is claimed without a path under `tests/reports/animation-runtime/`.
2. **Believable game motion.** The flagship (Aura Clash) shows crossfade transitions, attack layering, and varied hit reactions — not just clip swaps.
3. **Honest boundaries.** Motion matching, secondary animation, ragdoll, three-compat, and full-body IK are labeled fixture/sandbox/non-goal everywhere they appear.
4. **Composable primitives.** IK, blend trees, locomotion, root motion, and the character controller have at least one public example/template composing them.
5. **No dead/duplicate code masquerading as API.** Legacy `Retargeting.ts` and unused `FighterController.ts` are deprecated/removed or clearly marked.
6. **Deterministic where it matters.** Aura Clash deterministic replay and the animation evidence frames stay reproducible across the upgrade.

## Feature Specifications

### P0. Aura Clash Motion-Quality Upgrade

Goal: the deployed fighter visibly blends, layers, and reacts — using existing `@aura3d/animation` primitives.

Current foundation (the primitives already exist — the arena just doesn't use them):

- `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts` (`updateClips:1503`, `applyFighterAnimation:1533`, `syncFighterRoot:1544`) — current single-clip `TypedGLBActor.playClip` path.
- `packages/animation/src/AnimationMixer.ts` `crossFade:80`; engine `packages/engine/src/agent-api/AnimationController.ts` per-layer weights (`registerLayerMetadata`) + `bindRuntimeNode`.
- `packages/create-aura3d/templates/fighting-game/src/game/fighters.ts:90` — an existing `base` + `upper-body` two-layer controller config to mirror.
- `apps/aura-clash-showcase/src/playable/animation/auraClashClipMaps.ts` (11-key maps to extend with reaction variants).

Required work:

- Replace direct `actor.playClip(clip, time)` swaps with a short crossfade on state change (idle↔walk↔run, neutral↔guard, into/out of hurt).
- Add upper-body attack layering so light/heavy/special play on an upper-body mask while locomotion continues on the base layer.
- Vary hit reactions: at minimum distinguish grounded vs. airborne hit, and light vs. heavy knockback, instead of a single `hurt` clip.
- Keep deterministic replay: blending must be a pure function of fighter state + time.

Acceptance:

- `apps/aura-clash-showcase` deterministic-replay test still passes (identical final hash).
- A browser proof shows a measurable cross-fade window (two clips active, summed weight ~1) during a state change.
- A heavy hit and a light hit produce different reaction frames.

### P0. Honest-Claims & Boundary Gate

Goal: an agent or marketer cannot claim motion matching / ragdoll / full-body IK / Unity-Unreal parity.

Current foundation:

- `tools/cartoon-studio-docs-claims/index.ts` (claim-scanner pattern to copy)
- In-source disclaimers already present in `MotionMatchingFixtures.ts`, `SecondaryAnimationFixtures.ts`

Required work:

- Add `tools/animation-engine-docs-claims/index.ts` scanning README, `llms.txt`, `docs/animation/*`, `docs/api/*animation*`, and marketing for forbidden phrases (motion matching engine, inertialization, ragdoll physics [as production], full-body IK, Control Rig parity, Mecanim parity, cloth/hair simulation) unless adjacent to an explicit "fixture/non-goal" qualifier.
- Ensure `MotionMatchingFixtures` / `SecondaryAnimationFixtures` public exports carry a `claimBoundary` string in their result types.

Acceptance:

- Gate fails on a seeded overclaim fixture.
- Gate passes on current docs once they carry the qualifiers.

### P0. Dead/Duplicate Code Resolution

Goal: the public + app surface contains no animation code that looks live but is not.

Current foundation:

- `apps/aura-clash-showcase/src/fighters/FighterController.ts` (139) + `FighterAI.ts` (61) — dead; only `FighterAI` imports `FighterController`, neither reaches the route.
- `packages/animation/src/Retargeting.ts` (30-line stub) — still publicly exported from `packages/animation/src/index.ts`.
- KEEP: `apps/aura-clash-showcase/src/playable/combat/AuraClashFighterController.ts` — a live proof-boundary contract asserted by the arena; do NOT remove.

Required work:

- Remove `FighterController.ts`/`FighterAI.ts` (or move under a `legacy/` path excluded from build and commented as not wired to the arena).
- Mark `Retargeting.ts` `@deprecated` pointing to `HumanoidRetargeting.ts` and drop its export from `index.ts`, or remove the file if no consumer imports it.

Acceptance:

- A grep gate confirms no production import path resolves to `fighters/FighterController` or `fighters/FighterAI`.
- `AuraClashFighterController.ts` boundary proof still asserts in the arena.
- `pnpm typecheck` + `pnpm build` pass after removal/deprecation.

### P0. Animation Runtime Evidence (maintain)

Goal: the canonical "it really animates" proof stays green.

Current foundation:

- `tools/animation-runtime-evidence/index.ts`, `tools/animation-runtime-package-smoke/index.ts`
- `tests/reports/animation-runtime/evidence.json` + 5 PNGs

Required work:

- Keep `pnpm animation-runtime:release` passing across the 1.2 changes.
- Add a clip-blend evidence assertion that two clips are simultaneously active (already captured as `clip-blend.png`; make the weight assertion explicit).

Acceptance:

- `evidence.json` reports namedClipPlayback, restart, blend (with weights), event hitbox, viseme — all present.

### P0. Green Baseline (repair stale animation/game tests)

Goal: a future `animation-engine:readiness` gate starts from a clean run. Four suites are RED at HEAD (see "Current Test & Gate Reality").

Required work:

- `tests/unit/apps/aura-clash-arena-proof.test.ts:192` — update the expected `proof.release` from `"1.0.9"` to `"1.1.0"` to match the source bump (`auraClashArenaProof.ts`), or thread the version through a shared constant.
- `tests/unit/game-runtime/runtime-node-frame-loop-source-contract.test.ts:60-62` — update the expected source strings to the `globalThis.`-prefixed form the FrameLoop source actually uses (`FrameLoop.ts:69`).
- `tests/unit/workstream4.physics-animation.test.ts` — the 9 failures are physics-solver, not animation; quarantine/triage as a physics issue (out of animation scope) and split the file so the animation assertions are not blocked by physics drift.
- Re-run `pnpm prompt-animation:unit` and refresh `tests/reports/prompt-animation/unit.json` (last recorded run is FAIL).

Acceptance:

- `pnpm exec vitest run tests/unit/apps/aura-clash-arena-proof.test.ts tests/unit/game-runtime/runtime-node-frame-loop-source-contract.test.ts` is green.
- The animation half of `workstream4.physics-animation.test.ts` runs green independent of the physics failures.

### P1. Render-Path Hardening (toon skinning + WebGPU)

Goal: close the render-side animation caveats surfaced by the scan.

Required work:

- Add a skinned toon/cel material (or document that cartoon shading for rigged characters is a non-goal) — currently `CartoonMaterialStyle` only carries `preserveSkinning` metadata, with no `SkinnedToonMaterial`.
- Verify the WebGPU skinning path uploads the full 96-joint palette (the scan saw only 2 matrices) or document the WebGPU joint limit.
- Document the GPU morph-target caps (4 targets / 64 verts, CPU fallback) and the absence of skinned instancing.

Acceptance:

- A browser proof renders a skinned character with toon shading, or `known-limits.md` records it as a non-goal.
- WebGPU skinned-render proof matches WebGL2, or the limit is documented and gated.

### P1. Character Locomotion Kit / Template

Goal: a public example composing the locomotion primitives an agent would otherwise hand-wire.

Current foundation:

- `packages/animation/src/{LocomotionController,BlendTree,RootMotion}.ts`
- `packages/physics/src/CharacterController.ts`
- `packages/input` action maps

Required work:

- Add a documented example (and optionally a `character-controller` template) wiring input → `CharacterController` capsule → `BlendTree1D` (idle/walk/run by speed) → `AnimationController` crossfade → scene node.
- Provide a clip-map readiness check for the required locomotion clips.

Acceptance:

- Example route boots, moves a character with speed-driven blended locomotion, and exposes a route-proof object.

### P1. Fighting-Game Template Real-Asset Path

Goal: the template can produce a genuinely animated fighter, not only pose-baked fallback.

Current foundation:

- `packages/create-aura3d/templates/fighting-game/src/game/fighters.ts` (`templateReadiness: "source-only"`, capsule placeholders)
- Deployed arena as the reference implementation

Required work:

- Document the exact GLB clip requirements (the 9–11 fighter clips) and the `aura3d assets` resolve/validate flow.
- Make the template's animation controller use real crossfade when assets are present, falling back to capsules only when missing (clearly logged).

Acceptance:

- With supplied GLBs the template fighter animates with transitions; without them it renders labeled placeholders and says so in route proof.

### P2. Shared Fighter Animation Adapter

Goal: lift Aura Clash's combat→clip mapping into a reusable engine/animation helper.

Current foundation:

- `AuraClashArenaApp.updateClips` (app-side state→clip resolution)
- `packages/engine/src/agent-api/GameRuntime.ts` combat world

Required work:

- Extract a small adapter mapping `GameCombatActorSnapshot.state` → clip key + speed + crossfade, parameterized by a clip map, usable by both the arena and the fighting-game template.

Acceptance:

- Arena and template both consume the adapter; deterministic replay preserved.

### P2. Bounded Ragdoll / Secondary-Motion Decision

Goal: either ship a clearly-bounded ragdoll/secondary-motion path or formally record it as a non-goal.

Current foundation:

- `packages/physics/src/PhysicsSandboxFixtures.ts` (`spawnRagdoll`)
- `packages/animation/src/SecondaryAnimationFixtures.ts`

Required work:

- Decide: (a) promote a minimal `RagdollController` with joint limits + a KO hand-off in Aura Clash, or (b) document ragdoll/cloth/spring/foot-lock as explicit non-goals in `docs/project/known-limits.md` and the claims gate.

Acceptance:

- Either a bounded controller with a test, or a recorded non-goal that the claims gate enforces.

### P1. Animation Studio Template + CLI (`animation-studio`)

Goal: ship the `animation-studio` scaffold and the `anim:*` command contract defined in "Next Stage: Animation Studio".

Current foundation:

- Real engine primitives (clips, mixer, blend trees, `AnimationStateGraph`, two-bone IK, root motion, `HumanoidRetargeting`, GPU skinning).
- `validateCartoonClipMap`/`analyzeCartoonHumanoidRetargeting` patterns to mirror for a generic `validateAnimationClipMap`.
- `cartoon-studio` template + `episode:*` scripts as the structural precedent.
- CLI `assets validate-cartoon` to mirror as `assets validate-animation`.

Required work:

- Create `packages/create-aura3d/templates/animation-studio/*` with `anim:plan|preview|profile|package|verify` scripts.
- Add `src/character.ts` (typed rig + required clip list), `src/graph.ts` (state graph + blend trees), `src/ik.ts` (chains), `src/profile.ts` (export schema), `src/main.ts` (preview route with skeleton overlay + `window.__AURA3D_ANIMATION_STUDIO_PROOF__`).
- Add CLI `assets validate-animation` (rig + clip + bounds + retarget diagnostics) and a generic `validateAnimationClipMap` in `@aura3d/animation`.
- Write the output package contract (`animation-profile.json`, `rig-readiness.json`, preview frames, `skinning-evidence.json`, `motion-quality.json`, `route-proof.json`, `review-package.md`).

Acceptance:

- Clean external scaffold installs, builds, validates, previews, profiles, packages, and verifies.
- Preview route shows a blended state graph + IK with a skeleton overlay; proof exposes active state, active clip(s)+weights, skinning counts, errors.
- `anim:verify` fails on missing clips, missing crossfade window, blank skinning, or overclaims.

### P1. Animation Studio Authoring App (visual editor UI)

Goal: turn the real-but-headless editor layer into an actual authoring surface — the "studio" a user sees.

Current foundation:

- REAL headless engines: `TimelineEditorController`, `KeyframeEditor`, `CurveEditor` (cubic Bézier), `NonlinearAnimationEditor`, `CartoonSceneEditor`, `AssetDropZone` — all tested in `editor-runtime.test.ts`.
- `TimelineUI.ts` (untested DOM generator) as the only existing view.

Required work:

- Build a browser authoring route (in the `animation-studio` template and/or `packages/editor`): character/skeleton viewport (uses `buildSkeletonHelper` from `@aura3d/debug`), canvas timeline bound to `TimelineEditorController.bindRoutePlayback`, curve editor bound to `CurveEditor`, a state-graph node view, and clip/IK/blend inspectors.
- Wire every panel to the existing headless controllers (no new data model) and add browser tests proving edits round-trip and drive the preview.

Acceptance:

- A user can load a rig, scrub a timeline, edit a curve, rewire a state-graph transition, and see the preview update — in the browser.
- Browser test proves a curve edit and a transition rewire change rendered output; headless serialization round-trips.

### P2. Animation Studio Readiness Gate (`animation-studio:readiness`)

Goal: one aggregate gate for the Studio product, mirroring `aura3d11:readiness`.

Required work:

- `tools/animation-studio-readiness/index.ts` chaining: scaffold smoke, `anim:verify`, clip/rig validation, preview route proof, skinning render proof, motion-quality, and the docs-claims gate.

Acceptance:

- `pnpm animation-studio:readiness` fails on any missing Studio P0/P1 proof and writes `tests/reports/animation-studio/readiness.json`.

## Filename-Level Implementation Map

Done checklist: `[x]` = already true at baseline 1.1.0 (verified in scan); `[ ]` = 1.2 work remaining.

### Animation Package Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/animation/src/AnimationMixer.ts` | Keep | Multi-action blend, additive layers, bone masks, root motion. | P0 | [x] Real weighted blend, additive, masks, SLERP, crossfade. |
| `packages/animation/src/AnimationLayer.ts` | Keep | Per-bone masked animation layer. | P0 | [x] Real mask matching + weights. |
| `packages/animation/src/BlendTree.ts` | Keep + example | 1D/2D parameter blending. | P1 | [x] Real 1D threshold + 2D IDW. [ ] Public locomotion example composing it. |
| `packages/animation/src/AnimationStateGraph.ts` | Keep + preset | State machine + cartoon graph + locomotion preset. | P1 | [x] Real graph + `createCartoonAnimationStateGraph`. [x] `createLocomotionAnimationStateGraph` (idle/walk/run) added + tested. |
| `packages/animation/src/AnimationController.ts` | Document | Clip playback, crossfade, pose capture, events (blends clips by weight; `AnimationLayer` masks live in `AnimationMixer`). | P0 | [x] Real controller + `bindCartoonTimelineAction`. [ ] Documented relationship to engine `AnimationController`. |
| `packages/animation/src/AnimationClipRegistry.ts` | Keep | Registration + `validateCartoonClipMap` + generic `validateAnimationClipMap`. | P0 | [x] Real registry + cartoon validation. [x] Generic `validateAnimationClipMap` + `createAnimationClipRegistry` exported + tested. |
| `packages/animation/src/IK.ts` | Keep | Two-bone IK with pole vector + stretch. | P0 | [x] Real analytical solver. |
| `packages/animation/src/HumanoidRetargeting.ts` | Keep | Rig analysis + pose retarget + cartoon diagnostics. | P0 | [x] Real analysis/retarget. |
| `packages/animation/src/Retargeting.ts` | Remove (done) | 30-line stub superseded by humanoid retargeting. | P0 | [x] File deleted; export dropped from `index.ts` + `browser-index.ts`; dead-code gate enforces it. |
| `packages/animation/src/RootMotion.ts` | Keep | Loop-aware extract/apply (`createRootMotionWalkClip` helper actually lives in `LocomotionController.ts`). | P0 | [x] Real extract/apply + `suppressRootMotion`. |
| `packages/animation/src/{Bone,Skeleton,Skinning}.ts` | Keep | Skeleton hierarchy + GPU skinning palette. | P0 | [x] Real. |
| `packages/animation/src/LocomotionController.ts` | Keep + example | Path-follow locomotion + stride. | P1 | [x] Real. [ ] Used by a public kit/template. |
| `packages/animation/src/CrowdAnimation.ts` | Keep | Phase-staggered crowd sampling. | P2 | [x] Real. |
| `packages/animation/src/{SceneAnimationBridge,ECSAnimationBridge}.ts` | Keep | Write animation values to scene/ECS transforms. | P0 | [x] Real. |
| `packages/animation/src/MotionMatchingFixtures.ts` | Bound | Deterministic motion-match simulator. | P0 | [x] Real fixture; result already carries `claimBoundary` (`:60`/`:112`). [ ] Docs repeat the disclaimer. |
| `packages/animation/src/SecondaryAnimationFixtures.ts` | Bound | Deterministic foot-IK/spring telemetry. | P0 | [x] Real fixture; result carries `claimBoundary` (`:55`/`:91`) + `blockedClaims` (`:92`). [ ] Docs repeat the disclaimer. |
| `packages/animation/src/threejs-compatibility/*` | Bound | Three.js-shaped wrappers. | P1 | [x] `MorphTargetMixer` minimal-real. [ ] Docs state wrappers are not parity. |
| `packages/animation/src/index.ts` | Keep | Public animation surface. | P0 | [x] Exports all of the above. |

### Engine Runtime Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/engine/src/agent-api/AnimationController.ts` | Keep/Document | 3339-line runtime controller — INDEPENDENT reimplementation reusing the package's types/registry (not a subclass): `bindRuntimeNode`, per-layer weights (`registerLayerMetadata`), `registerEmbeddedGLBClips`, retargeting, pose-baked fallbacks. | P0 | [x] Real. [ ] Documented vs package controller. |
| `packages/engine/src/agent-api/FrameLoop.ts` | Keep | RAF/manual/fixed frame loop driving `onFrame`. | P0 | [x] Real time advancement. |
| `packages/engine/src/agent-api/RuntimeNodeHandle.ts` | Keep | `play`, `setAnimationPose`, binding metadata. | P0 | [x] Real node animation API. |
| `packages/engine/src/agent-api/ShotTimeline.ts` | Keep | Shot playback plan/sample/apply/install. | P0 | [x] Real; poses pos/rot/clip/mouth/visibility. |
| `packages/engine/src/agent-api/GameRuntime.ts` | Extend | Combat world + event application. | P2 | [x] Real combat world. [ ] Shared fighter clip adapter. |
| `packages/assets/src/GLTFAnimationRuntime.ts` | Keep | Extract/sample/apply embedded GLB clips + IK controller. | P0 | [x] Real GLB clip runtime + skeleton IK. |
| `packages/engine/src/agent-api/index.ts` | Keep | Public facade exports. | P0 | [x] Exports controller, frame loop, shot playback, combat. |

### Aura Clash (Deployed Flagship) Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts` | Modify | Combat→clip resolution + root sync. | P0 | [x] 11-state resolution, speed modulation, skinning/clip-readiness proof. [ ] Crossfade on state change. [ ] Upper-body attack layering. [ ] Varied hit reactions. |
| `apps/aura-clash-showcase/src/playable/combat/auraClashMoveData.ts` | Keep | Move frame data (light/heavy/special/guard/jump/down/dash). | P0 | [x] Real move table + tuning. |
| `apps/aura-clash-showcase/src/playable/animation/auraClashClipMaps.ts` | Keep | Per-fighter 11-clip maps + readiness validation. | P0 | [x] Real maps + `assertAuraClashClipReadiness`. |
| `apps/aura-clash-showcase/src/playable/evidence/auraClashArenaProof.ts` | Keep | Arena proof schema/release string. | P0 | [x] Proof at 1.1.0. [ ] Bump for 1.2 motion upgrade. |
| `apps/aura-clash-showcase/src/fighters/FighterController.ts` | Remove (done) | Legacy unused controller (139 lines). | P0 | [x] Deleted; dead-code gate enforces no import path resolves to it. |
| `apps/aura-clash-showcase/src/fighters/FighterAI.ts` | Remove (done) | Legacy AI (61 lines) importing the legacy controller. | P0 | [x] Deleted; no production import. |
| `apps/aura-clash-showcase/src/playable/combat/AuraClashFighterController.ts` | Keep | Live proof-boundary contract asserted by the arena. | P0 | [x] Keep — NOT dead code; boundary proof must still assert. |

### Physics / Character Controller Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/physics/src/CharacterController.ts` | Keep | Capsule controller + `createFightingCharacterController`. | P1 | [x] Real ground/jump/fast-fall/crouch. [ ] Used by a character-controller kit/template. |
| `packages/physics/src/PhysicsSandboxFixtures.ts` | Decide | `spawnRagdoll` sandbox preset. | P2 | [x] Real sandbox spawn. [ ] Promote to bounded `RagdollController` or record non-goal. |

### Template Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/create-aura3d/templates/fighting-game/src/game/fighters.ts` | Modify | Fighter animation controller + clips. | P1 | [x] Real controller w/ 2 layers; pose-baked fallback. [ ] Real-asset crossfade path + documented GLB requirements. |
| `packages/create-aura3d/templates/fighting-game/src/game/{moves,stage}.ts` | Keep | Move specs + stage/controls. | P1 | [x] Real specs. |
| `packages/create-aura3d/templates/character-controller/*` | Create | Locomotion kit scaffold. | P1 | [ ] New template composing input + capsule + blend tree + crossfade. |
| `packages/create-aura3d/templates/animation-studio/*` | Create | Animation Studio scaffold: `character.ts`, `graph.ts`, `ik.ts`, `profile.ts`, `main.ts` (preview route + proof), `anim:*` scripts. | P1 (M3) | [ ] Scaffolds and passes `anim:plan/preview/profile/package/verify`. |
| `packages/aura3d-cli/src/*` (`assets validate-animation`) | Create | Rig/clip/bounds/retarget validation CLI mode for Studio. | P1 (M3) | [ ] Rejects missing clips/unrigged characters; emits readiness JSON. |
| `packages/animation/src/AnimationClipRegistry.ts` (`validateAnimationClipMap`) | Modify (done) | Generic (non-cartoon) clip-map validator for Studio/fighter/locomotion. | P1 (M3) | [x] Implemented + exported; missing required clips fail unless fallback declared; 4 unit tests pass. |
| `packages/editor/*` or `animation-studio` route (authoring UI) | Create | Visual editor: skeleton viewport, canvas timeline, curve editor, state-graph node view, inspectors — wired to the headless controllers. | P1 (M4) | [ ] Browser edit→preview proof; serialization round-trips. |

### Scripting Files

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `packages/scripting/src/VisualGraphExecutor.ts` | Keep | `findAnimationEvent`, animation control nodes. | P2 | [x] Real `onAnimationEvent` + `VisualAnimationEvent`. |
| `packages/scripting/src/CartoonVisualNodes.ts` | Keep | Cartoon animation visual nodes. | P2 | [x] Real. |

### Docs

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `docs/animation/runtime-support.md` | Modify | Core runtime reference. | P0 | [x] Documents tracks/clips/mixer/layers/skinning/blend/state/root/IK + cartoon helpers. [x] Non-Goals section added (motion-matching/ragdoll/full-body-IK/foot-lock/Mecanim). |
| `docs/concepts/animation.md` | Modify | High-level overview + limits. | P0 | [x] Architecture + route coverage. [x] Non-goals line added (motion-matching/secondary/ragdoll/IK/Mecanim). |
| `docs/api/animation-runtime-events.md` | Keep | Skeletal anim + events + viseme patterns. | P0 | [x] 1.1.0 evidence-backed patterns. |
| `docs/animation/external-character-corpus.md` | Keep | Tested external characters + claim scope. | P0 | [x] Honest corpus scope. |
| `docs/animation/timeline-editor-integration.md` | Keep | Timeline/editor-runtime binding. | P1 | [x] Real. |
| `docs/api/prompt-animation.md` | Keep | Cartoon/episode animation contracts. | P0 | [x] Public API only. |
| `docs/project/known-limits.md` | Modify | Record animation non-goals. | P0 | [x] "Animation Engine Non-Goals And Fixtures" section lists ragdoll/cloth/foot-lock/motion-matching/full-body-IK/inertialization/Mecanim + skinned-toon/WebGPU/morph caveats. |
| `docs/project/aura3d-animation-engine-prd.md` | Create | This PRD. | P0 | [x] Filename-level animation plan exists. |
| `docs/project/aura3d-animation-engine-progress.md` | Create | Progress tracker. | P0 | [x] Created and linked from documentation index + site map. |
| `docs/project/aura3d-animation-studio-prd.md` (optional split) | Consider | If the Studio product grows, split its M3–M5 product spec into its own PRD (mirroring cartoon-studio). | P2 | [ ] Decide whether Studio warrants its own PRD file. |
| `README.md`, `llms.txt` | Modify | Honest animation capability + limits. | P0 | [x] 1.1.0 animation runtime described. [ ] Boundary phrasing passes claims gate. |

### Tests

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `tests/unit/animation/animation-controller.test.ts` | Keep | Controller playback/crossfade/events. | P0 | [x] Exists. |
| `tests/unit/animation/animation-state-graph.test.ts` | Keep | State graph transitions. | P0 | [x] Exists. |
| `tests/unit/animation/motion-quality.test.ts` | Keep | Motion quality summaries. | P0 | [x] Exists. |
| `tests/unit/animation/cartoon-animation-runtime.test.ts` | Keep | Cartoon clip/action binding. | P0 | [x] Exists. |
| `tests/unit/animation/game-animation-runtime.test.ts` | Keep | Game/combat animation runtime. | P0 | [x] Exists. |
| `tests/unit/animation/three-compat-animation.test.ts` | Keep | Three.js-compat behavior. | P1 | [x] Exists. |
| `tests/unit/animation/animation-runtime-node-source-gates.test.ts` | Keep | Node animation source gates. | P0 | [x] Exists. |
| `tests/unit/workstream4.physics-animation.test.ts` | Keep | Interp/mixer/IK/root/state/blend assertions. | P0 | [x] Exists (25+ assertions). |
| `tests/assets/gltf-animation-runtime.test.ts` | Keep | GLB clip import/binding. | P0 | [x] Exists. |
| `tests/browser/animation-browser.spec.ts` | Keep | Transform sample/crossfade/skinning pixels. | P0 | [x] Exists. |
| `tests/browser/animation-runtime-105.spec.ts` | Keep | Animation runtime browser evidence. | P0 | [x] Exists. |
| `tests/browser/threejs-parity-animation-*.spec.ts` | Keep | Keyframe/skinning/walk/multiple parity. | P1 | [x] Exist. |
| `apps/aura-clash-showcase/tests/deterministic-replay.spec.ts` | Keep | Deterministic combat replay. | P0 | [x] Exists. [ ] Still passes after motion upgrade. |
| `apps/aura-clash-showcase/tests/playable-smoke.spec.ts` | Modify | Clip readiness + attack animation. | P0 | [x] Exists. [ ] Add crossfade-window assertion. |

### Tools And Reports

| File | Action | Purpose | Priority | Done checklist |
| --- | --- | --- | --- | --- |
| `tools/animation-runtime-evidence/index.ts` | Keep | 5-frame runtime evidence + JSON. | P0 | [x] Writes `tests/reports/animation-runtime/evidence.json` + PNGs. [ ] Explicit blend-weight assertion. |
| `tools/animation-runtime-package-smoke/index.ts` | Keep | Package-level smoke. | P0 | [x] Exists. |
| `tools/three-compat-animation-readiness/index.ts` | Keep | Three.js-compat gate. | P1 | [x] Exists. |
| `tools/production-runtime-animation-controls-readiness/index.ts` | Keep | Controls readiness gate. | P1 | [x] Exists. |
| `tools/superiority-animation-fidelity/index.ts` | Keep | Fidelity claim validation. | P1 | [x] Exists. |
| `tools/aura-clash-flagship-readiness/index.ts` | Modify | Arena flagship gate. | P0 | [x] Exists. [ ] Includes motion-quality (crossfade/layering) checks. |
| `tools/animation-engine-docs-claims/index.ts` | Create (done) | Animation overclaim scanner. | P0 | [x] Created; fails seeded motion-matching/ragdoll/full-body-IK/Mecanim overclaims (verified), passes clean. `pnpm animation-engine:docs-claims`. |
| `tools/animation-engine-dead-code-gate/index.ts` | Create (done) | Dead/duplicate animation code gate. | P0 | [x] Created; fails if removed fighter controller / Retargeting is imported or re-exported. `pnpm animation-engine:dead-code`. |
| `tools/animation-studio-readiness/index.ts` | Create | Aggregate Studio gate (scaffold smoke + anim:verify + clip/rig + preview proof + skinning + motion + claims). | P2 (M5) | [ ] Writes `tests/reports/animation-studio/readiness.json`; fails on any Studio P0/P1 miss. |

## P0 Checklist

- [x] `@aura3d/animation` ships real clip playback, mixer blending, additive layers, and bone masks.
- [x] Real 1D/2D blend trees, parameter-driven state machine, and animation controller with crossfade exist.
- [x] Two-bone IK, humanoid retargeting, root motion, skeleton + GPU skinning are real and tested.
- [x] Engine runtime drives motion: `node.play(clip)`, `setAnimationPose`, `FrameLoop`, GLB clip extraction/application.
- [x] Shot playback (`createShotPlaybackPlan`/`sample`/`apply`/`installShotPlayback`) poses scene nodes each frame.
- [x] Combat world (`game.combatWorld`) drives the deployed Aura Clash arena with 11 animation states per fighter.
- [x] Aura Clash proves clip readiness, skinning bindings, tracks applied, and deterministic replay.
- [x] Animation runtime evidence (`evidence.json` + 5 PNGs) reported pass on last run (2026-06-05); `tests/unit/animation/*` (20 tests) pass live.
- [x] Skinned animation genuinely renders to pixels via GPU skinning shaders (`ShaderLibrary.ts:990`) + `ForwardPass` joint-matrix upload (WebGL2).
- [x] Separate public `@aura3d/three-compat` package provides real three.js animation migration shims (gated by `pnpm three-compat:animation`).
- [x] `@aura3d/debug` `AnimationInspector` + `@aura3d/workflows` `createAnimationLabWorkflow` are real.
- [x] Real (but headless) animation editor data layer: deterministic keyframe/curve/nonlinear editing, tested in `editor-runtime.test.ts`.
- [x] Runnable animation demo surface (`wow-*` viewers, `world-war-x-showcase`, `game-slice`, advanced gallery, skinned/morph benchmarks).
- [x] Motion-matching and secondary-animation paths self-disclose as fixtures in source.
- [x] Repaired the two animation-owned stale tests: `aura-clash-arena-proof` (now asserts the exported `AURA_CLASH_ARENA_PROOF_RELEASE`) and `runtime-node-frame-loop-source-contract` (now matches `globalThis.requestAnimationFrame`). Both green.
- [~] Triaged (out of animation-engine scope, documented, NOT fixed): `workstream4.physics-animation` 9 failures are physics-solver (rigid bodies/contacts/constraints); `prompt-animation:unit` has 14 failures in prompt/cartoon tooling (`prompt-source-audit`/`agent-api`). Report refreshed; both belong to the physics/cartoon workstreams.
- [ ] Aura Clash crossfades between states (measurable two-clip blend window) without breaking deterministic replay.
- [ ] Aura Clash plays attacks on an upper-body layer while locomotion continues on the base layer.
- [ ] Aura Clash hit reactions vary by grounded/airborne and light/heavy.
- [x] `tools/animation-engine-docs-claims` exists and fails seeded overclaims. (verified: exit 1 on seeded overclaim, exit 0 clean)
- [x] Legacy `FighterController.ts`/`FighterAI.ts` removed; dead-code gate enforces it. (deleted; `animation-engine:dead-code` green)
- [x] Legacy `Retargeting.ts` removed and public export dropped from `index.ts`/`browser-index.ts`; no live consumers.
- [x] `MotionMatchingFixtures`/`SecondaryAnimationFixtures` public results already carry `claimBoundary`/`blockedClaims` fields in source.
- [x] Docs (`runtime-support.md`, `concepts/animation.md`, `known-limits.md`) explicitly disclaim motion-matching, ragdoll, full-body-IK, inertialization, and Mecanim parity.
- [x] `pnpm animation-engine:readiness` aggregate gate exists and passes (25 tests + dead-code + docs-claims green).

## P1 Checklist

- [x] Three.js-compat animation gate (`pnpm three-compat:animation`) and parity browser specs pass.
- [x] Production-runtime animation-controls readiness gate passes.
- [ ] Skinned toon/cel material exists, or `known-limits.md` records it as a non-goal.
- [ ] WebGPU skinning verified to upload the full 96-joint palette, or the limit is documented/gated.
- [ ] GPU morph caps (4 targets/64 verts, CPU fallback) and no-skinned-instancing documented.
- [ ] React animation hooks (`useAnimation`/`useFrame`/`useAnimationController`) exist, or recorded as future work.
- [ ] Visual/canvas timeline+curve editor UI exists, or the headless-only boundary is documented (`TimelineUI` currently untested).
- [ ] Character locomotion kit/example composes input + capsule + blend tree + crossfade with a route proof.
- [ ] `character-controller` template scaffolds the locomotion kit.
- [ ] (M3) `animation-studio` template + `anim:plan/preview/profile/package/verify` scripts ship and pass an external scaffold smoke.
- [ ] (M3) `assets validate-animation` CLI + generic `validateAnimationClipMap` exist and reject bad rigs/clips.
- [ ] (M3) Animation Studio output package contract (`animation-profile.json`, `rig-readiness.json`, preview frames, `skinning-evidence.json`, `motion-quality.json`, `route-proof.json`, `review-package.md`) is written and validated.
- [ ] (M4) Visual authoring UI (skeleton viewport + canvas timeline + curve editor + state-graph view + inspectors) is wired to the headless controllers with a browser edit→preview proof.
- [ ] Fighting-game template has a documented real-asset crossfade path; placeholders are clearly labeled in route proof.
- [ ] Blend tree and locomotion controller have at least one public documented usage example.
- [ ] Docs state three.js-compat animation wrappers are not parity.

## P2 Checklist

- [ ] Shared fighter animation adapter (state→clip+speed+crossfade) used by both arena and template.
- [x] Reusable locomotion/fighter `AnimationStateGraph` preset beyond the cartoon graph (`createLocomotionAnimationStateGraph`, tested).
- [x] Generic fighter/locomotion clip-map validator in `@aura3d/animation` (`validateAnimationClipMap`, not app-side, tested).
- [ ] Ragdoll decision resolved: bounded `RagdollController` with a test, or recorded non-goal enforced by the claims gate.
- [ ] Engine vs package `AnimationController` relationship documented for agents.
- [ ] Animation event timeline authoring UI (only if promoted from non-goal).
- [ ] (M5) `tools/animation-studio-readiness` + `pnpm animation-studio:readiness` aggregate gate ships and is green.
- [ ] (M5) Render-path caveats closed or documented: skinned toon material, WebGPU 96-joint skinning, GPU-morph caps, no skinned instancing.

## Sequenced Build Plan (Milestones)

The specs above are dependency-ordered into milestones. Do them top-to-bottom; each milestone has a hard definition of done that gates the next.

| Milestone | Scope (specs) | Depends on | Definition of done |
| --- | --- | --- | --- |
| **M0 — Green baseline & honesty** | P0 Green Baseline; P0 Dead/Duplicate Code; P0 Honest-Claims Gate; docs disclaimers; `animation-engine:readiness` aggregate | — | All animation/game unit suites green at HEAD (arena-proof + frame-loop strings fixed, physics-9 triaged out of animation scope, `prompt-animation:unit` refreshed); legacy `FighterController`/`FighterAI` removed + `Retargeting.ts` export dropped; `tools/animation-engine-docs-claims` fails seeded overclaims; docs disclaim motion-matching/ragdoll/full-body-IK/inertialization/Mecanim; `pnpm animation-engine:readiness` exists and passes. |
| **M1 — Believable motion in the flagship** | P0 Aura Clash Motion-Quality Upgrade; P0 Animation Runtime Evidence (maintain) | M0 | Aura Clash crossfades between states (measurable two-clip blend window), layers attacks on an upper-body mask, varies hit reactions (grounded/airborne, light/heavy); deterministic replay still identical; arena proof release bumped; evidence route stays green. |
| **M2 — Reusable composition** | P1 Character Locomotion Kit; P1 Fighting-Game Template Real-Asset Path; P2 Shared Fighter Animation Adapter | M1 | Locomotion kit/example (input + capsule + blend tree + crossfade) boots with route proof; fighting-game template animates with supplied GLBs (labeled placeholders otherwise); arena + template share one combat→clip adapter. |
| **M3 — Animation Studio product** | P1 Animation Studio Template + CLI (`animation-studio`, `anim:*`, `assets validate-animation`, `validateAnimationClipMap`) | M2 | Clean external scaffold installs/builds/validates/previews/profiles/packages/verifies; output package contract written; `anim:verify` fails on missing clips / no crossfade window / blank skinning / overclaims. |
| **M4 — Studio authoring UI** | P1 Animation Studio Authoring App (visual editor route wired to the headless controllers) | M3 | Browser route: load rig, scrub timeline, edit a curve, rewire a state-graph transition, see preview update; browser test proves edits change rendered output; headless serialization round-trips. |
| **M5 — Render-path & hardening** | P1 Render-Path Hardening (toon skinning + WebGPU); P2 Bounded Ragdoll decision; P2 Animation Studio Readiness Gate | M3 (M4 for UI proof) | Skinned toon material shipped or recorded non-goal; WebGPU skinning verified to 96 joints or documented/gated; GPU-morph caps + no-skinned-instancing documented; ragdoll resolved (bounded controller+test or enforced non-goal); `pnpm animation-studio:readiness` green. |

Scope boundary for the next stage: M0–M3 are the committed "next stage" (engine honest + believable + reusable + the Studio product). M4 (visual UI) and M5 (render-path/ragdoll) are in-stage stretch — ship them if M0–M3 land, otherwise they roll to the following iteration with their non-goals explicitly recorded.

## Release Gates

Required before the 1.2 animation scope can ship:

```bash
pnpm typecheck
pnpm build
pnpm exec vitest run tests/unit/animation tests/assets/gltf-animation-runtime.test.ts   # all green at HEAD
# NOTE: tests/unit/workstream4.physics-animation.test.ts currently has 9 PHYSICS failures (not animation) — triage separately.
pnpm animation-runtime:release
pnpm three-compat:animation
pnpm production-runtime:animation-controls
pnpm game-runtime:release            # parallel game-runtime suite (typecheck+unit+browser+template+docs+evidence+package)
pnpm prompt-animation:release        # cartoon/episode animation contract + evidence (refresh: unit report last ran RED)
pnpm verify:aura-clash-flagship      # NOTE: aura-clash-arena-proof unit test is RED until the release-string is synced
pnpm animation-engine:readiness      # 1.2 aggregate: bundles the above + docs-claims + dead-code gate
```

`pnpm animation-engine:readiness` must run: typecheck, build, animation unit tests, animation-runtime evidence, three-compat readiness, Aura Clash flagship readiness (with the new crossfade/layering checks), the animation docs-claims gate, and the dead-code gate. It must fail if any P0 item above is unmet.

## Behavioral & Visual Acceptance Bar

The bar is not "Unity Mecanim." The bar is "a viewer can tell characters move with intent and transitions, and the docs never claim capabilities the runtime does not have."

Pass criteria:

- Clips play, loop, restart, and crossfade with visible blended frames.
- The deployed fighter transitions between locomotion states without a hard snap.
- Attacks layer over locomotion; light and heavy hits read differently.
- IK, retargeting, root motion, and skinning have passing tests/evidence.
- Every fixture/non-goal (motion matching, secondary animation, ragdoll, full-body IK, three-compat) is labeled as such wherever it is exposed.

Fail criteria:

- Any state change is a hard clip swap with no transition in the flagship.
- A fixture is presented as a production system in docs, README, `llms.txt`, or marketing.
- Legacy/unused animation code is importable from a production path.
- Deterministic replay breaks under the motion upgrade.

## Comparison And Strategic Position

Against Three.js:

- Aura3D wins on typed clip maps, readiness validation, shot/combat playback helpers, and agent-usable composition. Three.js remains lower-level and more flexible for custom rendering/animation.

Against Babylon.js:

- Aura3D wins on AI-agent scaffolding and evidence; Babylon remains a deeper general runtime with a broader animation/editor ecosystem.

Against Unity/Unreal:

- No competition on Mecanim, Animation Rigging, Control Rig, motion matching, or ragdoll-physics depth. Aura3D competes only on browser-first, TypeScript-first, agent-generated motion with reproducible evidence.

## Risks

- Scope creep: chasing real motion matching / ragdoll / cloth would derail the consolidation goal — they are explicit non-goals unless promoted.
- Determinism: adding crossfade/layering to Aura Clash risks breaking deterministic replay if blending reads wall-clock instead of fighter-state time.
- Claim drift: marketing may overstate the fixtures as production systems; the docs-claims gate is the guardrail.
- Two controllers: the package and engine `AnimationController` could confuse agents without clear docs.

## Open Decisions

- Promote a bounded `RagdollController` for KO, or keep ragdoll a documented non-goal?
- Ship a standalone `character-controller` template, or fold the locomotion kit into the fighting-game template only?
- Consolidate the package and engine `AnimationController`, or keep both and document the split?
- Delete legacy `FighterController.ts`/`Retargeting.ts`, or quarantine for reference?

Recommended decisions:

- Keep ragdoll a documented non-goal for 1.2; revisit if a real physics-blend path is funded.
- Ship the standalone `character-controller` template — it is the missing reuse story.
- Keep both controllers but add a one-paragraph "which to use" doc.
- Delete the legacy fighter controller; `@deprecated` the legacy retargeter for one release, then remove.

## Final Definition Of Done

The next stage is delivered milestone by milestone (see "Sequenced Build Plan"). The committed scope (M0–M3) is done only when:

- (M0) the shipped 1.1.0 animation runtime is documented honestly with fixtures/non-goals labeled; the stale RED suites are repaired; legacy/duplicate code is removed and a gate enforces it; the docs-claims gate blocks motion-matching/ragdoll/full-body-IK/Unity-Unreal overclaims; `pnpm animation-engine:readiness` passes;
- (M1) the deployed Aura Clash arena crossfades, layers attacks, and varies hit reactions while keeping deterministic replay;
- (M2) a character locomotion kit/template composes the primitives an agent would otherwise hand-wire, and the fighting-game template animates with real assets;
- (M3) the `animation-studio` template + `anim:*` command contract + `assets validate-animation` ship, producing the Animation Studio output package, with `anim:verify` failing fake/incomplete profiles.

The in-stage stretch (M4 visual authoring UI, M5 render-path/ragdoll hardening + `animation-studio:readiness`) ships if M0–M3 land; otherwise it rolls forward with non-goals recorded in `docs/project/known-limits.md`.
