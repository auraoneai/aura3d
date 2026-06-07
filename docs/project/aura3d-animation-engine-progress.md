# Aura3D Animation Engine Progress

Version: 1.2 (baseline 1.1.0)
Date started: 2026-06-07
Source PRD: `docs/project/aura3d-animation-engine-prd.md`
Source vision: `InitialPRD-Animation.md`

This file tracks verified implementation progress for the Animation Engine PRD. A checkbox is marked `[x]` only when source code and verification evidence exist in the current worktree; baseline 1.1.0 items are marked `[x]` because they were verified during the codebase scan. `[ ]` items are remaining 1.2 work.

Verification: status below was confirmed with file:line evidence via THREE rounds of deep scanning (2026-06-07) — 18 agent lanes total plus live test runs. Round 3 added the render path (GPU skinning), the separate `three-compat` package, debug/workflows, the headless editor, the `wow-*`/`world-war-x`/`game-slice` demo surface, and LIVE test execution (not just report files).

## Current Verified Items

- [x] Detailed Animation Engine PRD exists at `docs/project/aura3d-animation-engine-prd.md`.
- [x] Codebase scan confirms `@aura3d/animation` 1.1.0 ships a real runtime (29 source files): clip core, mixer, layers, blend trees, state machine/graph, controller, clip registry, two-bone IK, humanoid retargeting, root motion, skeleton/skinning, locomotion, crowd, scene/ECS bridges.
- [x] `@aura3d/engine-runtime` 1.1.0 drives motion at runtime: `node.play(clip)`, `setAnimationPose`, `FrameLoop`, runtime `AnimationController`, GLB clip extraction/application, shot playback, combat world.
- [x] Deployed Aura Clash arena (`AuraClashArenaApp.ts`, 2091 lines) resolves 11 animation states per fighter off `game.combatWorld`, with clip-readiness, skinning, and deterministic-replay proof.
- [x] Animation evidence exists: `tests/reports/animation-runtime/evidence.json` + 5 PNGs; 7 unit suites under `tests/unit/animation/`; browser + three.js-parity specs.
- [x] Motion-matching and secondary-animation paths self-disclose as fixtures in source.
- [x] Skinned animation genuinely renders to pixels: GPU skinning GLSL (`ShaderLibrary.ts:990`), `ForwardPass.ts:1495` joint-matrix upload, `GLTFAnimationRuntime.ts:646` palette feed (WebGL2).
- [x] Separate public `@aura3d/three-compat` package is a real three.js animation migration layer (wraps the internal `threejs-compatibility/`).
- [x] `@aura3d/debug` `AnimationInspector`/`buildSkeletonHelper` and `@aura3d/workflows` `createAnimationLabWorkflow` are real.
- [x] Real (headless) animation editor data layer (Timeline/Keyframe/Curve/Nonlinear/Cartoon-scene + AssetDropZone), tested in `editor-runtime.test.ts`.
- [x] Large runnable demo surface: `wow-*` animation viewers, `apps/world-war-x-showcase` (2nd combat-anim app), `apps/advanced-examples-gallery`, root `templates/game-slice`, and skinned/morph benchmarks — all using `createGLTFSceneAnimationMixer`.

## Live Test Reality (run 2026-06-07, not just report files)

- GREEN: `tests/unit/animation/*` (7 files, 20 tests), `tests/assets/gltf-animation-runtime.test.ts`. Reports green on last run: `animation-runtime/*`, `game-runtime/*`, `aura3d11/*`.
- RED at HEAD (pre-existing; .md edits cannot affect test code):
  - `tests/unit/apps/aura-clash-arena-proof.test.ts` — expects `proof.release "1.0.9"`, source is `"1.1.0"`.
  - `tests/unit/game-runtime/runtime-node-frame-loop-source-contract.test.ts` — expects bare `requestAnimationFrame`, source uses `globalThis.requestAnimationFrame`.
  - `tests/unit/workstream4.physics-animation.test.ts` — 9 failures, ALL physics (rigid bodies/contacts/constraints), ZERO animation.
  - `tests/reports/prompt-animation/unit.json` — last recorded run FAIL.

## Current Honest Gaps (from scan)

| Gap | Where | PRD item |
| --- | --- | --- |
| Deployed arena bypasses crossfade/layering — uses `TypedGLBActor.playClip` once/frame (`:1533`), hard `clipTime=0` reset on state change (`:1524`). Primitives exist: `AnimationMixer.crossFade`, engine `AnimationController` per-layer weights, and the `fighting-game` template's `base`+`upper-body` config (`fighters.ts:90`). | `AuraClashArenaApp.updateClips:1503`/`applyFighterAnimation:1533` | P0 Motion-Quality Upgrade |
| Hit reactions hard-coded to single `hurt`/`ko` clip (no directional/aerial) | `AuraClashArenaApp:1517` + clip maps | P0 Motion-Quality Upgrade |
| No combo/cancel system; static KO pose `Death01` clamped to 1.18s (no ragdoll) | `AuraClashArenaApp:163` | P0 / P2 |
| Dead fighter controller still present (139+61 lines; only `FighterAI` imports `FighterController`) | `apps/aura-clash-showcase/src/fighters/{FighterController,FighterAI}.ts` | P0 Dead-Code Resolution |
| Legacy retargeter is a 30-line stub still exported publicly | `packages/animation/src/Retargeting.ts` (+ `index.ts` export) | P0 Dead-Code Resolution |
| No animation overclaim gate | (to create) `tools/animation-engine-docs-claims` | P0 Honest-Claims Gate |
| Fixtures self-disclaim in source (`claimBoundary`/`blockedClaims`) but DOCS do not disclaim motion-matching/ragdoll/full-body-IK/inertialization/Mecanim | `MotionMatchingFixtures.ts:60`, `SecondaryAnimationFixtures.ts:55,92` vs `docs/animation/*` | P0 Honest-Claims Gate |
| Fighting-game template is source-only (pose-baked fallback) | `templates/fighting-game/src/game/fighters.ts:63` | P1 Template Real-Asset Path |
| No character-controller template / locomotion kit example | (to create) | P1 Locomotion Kit |
| Three.js-compat animation classes are thin stubs (except `MorphTargetMixer`) | `packages/animation/src/threejs-compatibility/*` | P1 (docs boundary) |
| Ragdoll is sandbox spawner only (`spawnRagdoll`, hinge constraints, no joint limits / no `RagdollController` / no anim-blend; `claimBoundary:142`) | `physics/PhysicsSandboxFixtures.ts` | P2 decision / non-goal |
| Stale RED tests at HEAD (release-string + RAF source-string + physics-9 + prompt-animation:unit) | see Live Test Reality | P0 Green Baseline |
| No skinned toon/cel material (cartoon shading for rigged chars deferred; only `preserveSkinning` metadata) | `rendering/src/cartoon/CartoonMaterialStyle.ts` | P1 Render-Path Hardening |
| WebGPU skinning path possibly incomplete (2 vs 96 joints); GPU morphs capped (4/64, CPU fallback); no skinned instancing | `rendering/src/WebGPUDevice.ts`, `ShaderLibrary.ts` | P1 Render-Path Hardening |
| `@aura3d/react` has no animation hooks (declarative scene only) | `packages/react/src/index.ts` | P1 (future work) |
| No visual/canvas timeline+curve editor UI; `TimelineUI` is an untested DOM generator | `packages/editor-runtime/src/TimelineUI.ts` | P1 (docs boundary) |
| KEEP (not a gap): `AuraClashFighterController.ts` is a live proof boundary, not dead code | `apps/aura-clash-showcase/src/playable/combat/AuraClashFighterController.ts` | — |

## Milestone Roadmap (next stage)

Dependency-ordered; each milestone gates the next (full detail + per-milestone definition of done in the PRD's "Sequenced Build Plan").

| Milestone | Scope | Status |
| --- | --- | --- |
| M0 — Green baseline & honesty | repair RED tests, remove dead code, docs disclaimers, claims gate, `animation-engine:readiness` | **DONE** (animation-scoped: 2 owned tests fixed, dead code removed, gates + disclaimers + readiness green; physics-9 & prompt-tooling-14 triaged out of scope) |
| M1 — Believable motion in flagship | Aura Clash crossfade + attack layering + varied hit reactions (replay stable) | Not started |
| M2 — Reusable composition | locomotion kit + fighting-game real-asset path + shared fighter adapter | In progress — engine building blocks landed (`createLocomotionAnimationStateGraph`, tested); locomotion kit/template + shared adapter remain |
| M3 — Animation Studio product | `animation-studio` template + `anim:*` + `assets validate-animation` + output package | In progress — `validateAnimationClipMap` (generic clip-map validator) landed + tested; template + CLI + output package remain |
| M4 — Studio authoring UI (stretch) | visual editor route wired to headless controllers | Not started |
| M5 — Render-path & hardening (stretch) | toon skinning / WebGPU skinning / ragdoll decision / `animation-studio:readiness` | Not started |

Committed next-stage scope = M0–M3. M4–M5 are in-stage stretch.

## Active Parallel Lanes

| Lane | Scope | Status | Verification required |
| --- | --- | --- | --- |
| 1 | Aura Clash crossfade + attack layering + varied hit reactions | Not started | Two-clip blend window proof + light/heavy reaction diff + deterministic replay still passes. |
| 2 | Honest-claims gate + fixture `claimBoundary` fields | **DONE** | `tools/animation-engine-docs-claims` fails seeded overclaim (verified exit 1), passes current docs (exit 0). |
| 3 | Dead/duplicate code resolution | **DONE** | `FighterController`/`FighterAI` deleted; `Retargeting.ts` removed + exports dropped; `animation-engine:dead-code` green. |
| 4 | Character locomotion kit + template | Not started (M2) | Route boots with speed-driven blended locomotion + route proof. |
| 5 | Docs boundary updates + known-limits | **DONE** | `runtime-support.md`/`concepts/animation.md`/`known-limits.md` label fixtures/non-goals; claims gate passes. |
| 6 | `animation-engine:readiness` aggregate gate | **DONE** | `pnpm animation-engine:readiness` runs 25 animation/arena/frame-loop tests + dead-code + docs-claims gates; green. |

## P0 PRD Checklist Progress

- [x] Real clip playback, mixer blending, additive layers, bone masks.
- [x] Real blend trees, state machine, controller crossfade.
- [x] Two-bone IK, humanoid retargeting, root motion, skeleton + skinning real and tested.
- [x] Engine runtime drives motion (`play`/`setAnimationPose`/`FrameLoop`/GLB extraction).
- [x] Shot playback poses scene nodes each frame.
- [x] Combat world drives 11-state Aura Clash arena.
- [x] Aura Clash clip-readiness/skinning/deterministic-replay proof.
- [x] Animation runtime evidence + `pnpm animation-runtime:release` pass.
- [x] Motion-matching / secondary-animation self-disclose as fixtures.
- [ ] Aura Clash crossfades between states (measurable blend window).
- [ ] Aura Clash attack layering on upper-body mask.
- [ ] Aura Clash hit reactions vary by grounded/airborne and light/heavy.
- [x] `tools/animation-engine-docs-claims` exists and fails seeded overclaims.
- [x] Legacy fighter controller removed; dead-code gate enforces it.
- [x] Legacy `Retargeting.ts` removed AND public export dropped; no live consumers.
- [x] Fixture public results already carry `claimBoundary`/`blockedClaims` in source.
- [x] Docs (`runtime-support.md`/`concepts/animation.md`/`known-limits.md`) disclaim motion-matching/ragdoll/full-body-IK/inertialization/Mecanim.
- [x] Green baseline (animation-scoped): `aura-clash-arena-proof` + `runtime-node-frame-loop-source-contract` repaired & green; `workstream4` physics-9 and `prompt-animation:unit`-14 triaged as out-of-scope (physics/cartoon workstreams), documented, report refreshed.
- [x] Skinned animation render path verified (GPU skinning shaders + `ForwardPass` upload, WebGL2).
- [x] `pnpm animation-engine:readiness` aggregate gate exists and passes.

## P1 PRD Checklist Progress

- [x] Three.js-compat animation gate + parity specs pass.
- [x] Production-runtime animation-controls readiness gate passes.
- [ ] Skinned toon/cel material exists or recorded as non-goal.
- [ ] WebGPU skinning verified (96-joint palette) or limit documented/gated.
- [ ] GPU morph caps + no-skinned-instancing documented.
- [ ] React animation hooks exist or recorded as future work.
- [ ] Visual/canvas timeline+curve editor UI exists or headless-only boundary documented.
- [ ] Character locomotion kit/example with route proof.
- [ ] (M3) `animation-studio` template + `anim:*` scripts + external scaffold smoke.
- [ ] (M3) `assets validate-animation` CLI + generic `validateAnimationClipMap`.
- [ ] (M3) Animation Studio output package contract written + validated.
- [ ] (M4) Visual authoring UI wired to headless controllers with browser edit→preview proof.
- [ ] `character-controller` template scaffolds the kit.
- [ ] Fighting-game template real-asset crossfade path documented; placeholders labeled.
- [ ] Blend tree + locomotion controller public usage examples.
- [ ] Docs state three.js-compat wrappers are not parity.

## P2 PRD Checklist Progress

- [ ] Shared fighter animation adapter used by arena + template.
- [x] Reusable locomotion/fighter state-graph preset (`createLocomotionAnimationStateGraph`, tested).
- [x] Generic fighter/locomotion clip-map validator in `@aura3d/animation` (`validateAnimationClipMap`, tested).
- [ ] Ragdoll decision resolved (bounded controller or recorded non-goal).
- [ ] (M5) `tools/animation-studio-readiness` + `pnpm animation-studio:readiness` ships green.
- [ ] (M5) Render-path caveats closed/documented (toon skinning, WebGPU 96-joint, morph caps, no skinned instancing).
- [ ] Engine vs package `AnimationController` relationship documented.
- [ ] Animation event timeline authoring UI (only if promoted).

## Notes

- The animation runtime is genuinely real at baseline 1.1.0; this PRD is consolidation + believable-motion + honest-boundary work, not green-field.
- `@aura3d/animation` has no co-located `tests/` directory; its coverage lives in `tests/unit/animation/` (7 suites) plus `tests/unit/workstream4.physics-animation.test.ts` and `tests/assets/gltf-animation-runtime.test.ts`.
- Deterministic replay in Aura Clash is the hardest constraint on the motion upgrade — any blending must be a pure function of fighter state + time.
- This progress file does not replace the PRD. The PRD remains the full source of scope.
