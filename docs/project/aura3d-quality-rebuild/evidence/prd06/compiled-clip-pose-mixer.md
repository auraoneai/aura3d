# PRD-06 evidence — CompiledClip + PoseMixer + applyClips + clip-name fallback (T1.2, T1.3, T1.7, T1.8)

Branch: `qr/prd06-pose-foundations`. Parity target: three r185 `AnimationMixer`/`AnimationAction` semantics within 1e-4 (quats up to sign) across soldier.glb, fox.glb, CesiumMan.glb, RobotExpressive.glb.

## What landed

| Task | Artifact | Status |
|---|---|---|
| T1.2 | `packages/animation/src/pose/CompiledClip.ts` — flat `Float32Array` times/values per track, per-action `Uint32Array` cursor with monotone-forward interval search, LINEAR / STEP / glTF CUBICSPLINE (quats normalized directly). Equality to `AnimationTrack.sample` within 1e-6 over 1000 random times; hot-loop sample ≤ 25 µs | implemented, 4/4 tests |
| T1.3 | `packages/animation/src/pose/PoseMixer.ts` — §6.4 base blend with rest fill, override + additive layers, BoneMask weights, fades, `crossFadeFrom`/`crossFadeTo` (incl. warp), `syncWith`/`syncGroup`, `setEffectiveTimeScale`, loop modes (`repeat`/`once`/`pingpong`), per-(bone,channel) incremental accumulate `mix(acc, vᵢ, wᵢ/(Σ+wᵢ))`, additive accumulator identity-init | implemented, 24/24 parity tests |
| T1.7 | `GLTFSceneAnimationRuntime.applyClips` — re-implemented on a lazy per-runtime `PoseMixer` in stateless mode: `evaluateSamples(PoseSampleSpec[])` drives the same accumulate → rest-fill → additive-accumulator pipeline with explicit per-sample times; scene-wide `SkeletonBinding` binds every `traverse`-ordered node as a joint (glTF node indices, duplicate names covered); clip `mask` lowers to a per-bone `Float32Array` cached per mask object; morph-weight/material/light tracks and unbound node tracks keep the legacy accumulator path; pose output is written to `sampledTargets` before the legacy accumulators, so `applySampledTargets` order is preserved | implemented; existing applyClips cases green modulo the two documented semantic changes |
| T1.8 | `resolveGLTFClipName(requested, available, { fallback })` — `fallback:"error"` returns `undefined` on a level-1–3 miss, `"first"` keeps the legacy first-clip fallback; ambient default = `"error"` under 3.1 (`A3D_QR_ANIMATION`/`A3D_QR`/`?a3d-qr=` env/URL sources), `"first"` otherwise. `compiler/animation.ts` passes `fallback` from `qrAnimationFlags()` at both resolve sites, warns `ANIMATION_CLIP_NOT_FOUND` with available names, and records `clip-apply-failed` into a pending-degradations queue (`takeClipApplyDegradations()`) for the C-36 `ctx.degrade` drain (Q-06-1, lane 15) | implemented, new unit cases |

## three r185 semantics ported verbatim

- `Quaternion.slerpFlat` (`quatFlat.ts`): early copy only when all four components `!==`; `dot < 0` negates; `dot < 0.9995` → acos/sin slerp; else lerp + normalize. **No** `cos ≥ 1` early-exit — near-identical float32 quats still lerp to the true midpoint (a `cos ≥ 1` shortcut produced ~2–5e-4 drift).
- `AnimationMixer`: `time > end` strict end-detection on fades and warps; `warp()` is a **multiplicative** timescale interpolant (`values = [start/base, end/base]`, `this.timeScale` base unchanged) — treating it as absolute double-applies the start ratio (`crossfade with warp` frame-0 diff ~4e-3 before fix).
- `crossFadeFrom`: `fadeOut.warp(1 → fadeOutDur/fadeInDur)`, `fadeIn.warp(fadeInDur/fadeOutDur → 1)`, `_restoreTimeScale` saved before warp; `stopWarping` clears `_restoreTimeScale`.
- `makeClipAdditive` marks clips via `isClipAdditive` (WeakSet) so `PoseMixer` routes them through `accumulateAdditive` without an explicit flag.

## Bug fixed en route

`lerpVec3Flat` read `b[aOffset+k]` for components 1–2 instead of `b[bOffset+k]` — NaN-poisoned y/z of every vec3 channel for boneIndex > 0 whenever a second action mixed in (multi-action, crossfade, warp cases). Diff signature (only y/z, only vec3, only bones > 0) localized it.

## T1.7 documented semantic changes (spec-mandated)

`applyClips` on the pose path differs from the old accumulator blend in exactly the two ways the PRD names:

- **rest blend** — a partial-weight mix fills the remainder from the rest pose instead of renormalising across only the contributing clips.
- **rest reset** — a bone covered by the blend gets every channel written (rest-filled), so `transformTracksApplied` counts 3 transform writes per covered bone (position/rotation/scale) vs the old 1-per-present-channel. The `blends multiple imported clips` expectation moved 1 → 3 accordingly.

Masked-out bound tracks contribute weight 0 through the per-bone mask array (same effective result as the old per-track skip); unbound node tracks keep legacy `missingTargets` reporting.

## T1.8 notes

- `animationClipDefaultsAre31()` in `GLTFAnimationRuntime.ts` mirrors the §5.2 env/URL subset (`A3D_QR_ANIMATION` scalar, `A3D_QR`/`A3D_QR_FLAGS` list, `?a3d-qr=` URL list) for the ambient default when callers don't pass `fallback`. The compiler always passes `fallback` explicitly from `qrAnimationFlags()`, so app-level flag overrides are honored there.
- The `clip-apply-failed` pending queue is the runtime-side record; lane 15 drains it through `ctx.degrade` (queued alongside `takeWorldEnvDegradations` precedent). Q-06-1 qr-request updated accordingly.

## Runs

- `pnpm exec vitest run tests/unit/animation/pose-mixer-three-parity.test.ts tests/unit/animation/compiled-clip.test.ts` — **28/28 pass** (2026-10-07): single clip, weight 0.3 + rest fill, three actions 0.5/0.3/0.4, crossfade t=0.1/0.2, crossfade + warp, `makeClipAdditive` within 1e-5, all four rigs × 120 frames @ 1/60 dt.
- `pnpm exec vitest run tests/assets/gltf-animation-runtime.test.ts tests/unit/agent-api/production-actor-dispatch.test.ts` — **20/20 pass** after T1.7/T1.8 (incl. new T1.8 warn+degradation + flag-off first-clip cases).
- `pnpm exec tsx --test packages/assets/tests/assets.test.ts` — **23/23 pass** (new `resolveGLTFClipName` fallback-matrix case).
- `pnpm exec vitest run tests/unit/assets/` — **126/126 pass**.
- `pnpm exec vitest run tests/unit/animation/` — 268/269 pass; the one failure is `animation-runtime-node-source-gates.test.ts`, a pre-existing red on main (expects `node.animation = { ...options, clip };` in `agent-api/index.ts`, refactored by QR-13 merges — file/pattern diverged on main before this branch).
- `pnpm typecheck:raw` — 55 errors, identical to the `tools/threejs-parity-*` baseline on main. `tsc -p tsconfig.build.json --noEmit` — no new errors (the stricter emit config that caught the earlier `this`-return TS2322).
- `pnpm exec eslint` on all touched files — clean.

## NOT RUN

- Browser/pose consumer paths beyond `applyClips` — actor `PoseMixer` wiring lands with T1.9–T1.11 (`crossFadeTo` on the actor handle, `A3D_QR_ANIMATION_POSE_MIXER` routing of `AnimationMixer.blendBase`/`AnimationController.blendStates`).

## T1.9 — stateful per-actor PoseMixer (commit 535ee30c)

- `node.animation.clip` on a skinned actor now drives a per-actor `PoseMixer`
  under `A3D_QR_ANIMATION` when the runtime exposes `mixer()`/`applyPoseMixer`
  (stub runtimes keep `playClip`): `clip` change → `crossFadeTo(new,
  crossFade ?? 0.2, {warp, transition, syncGroup})`, `speed` →
  `setEffectiveTimeScale`, `loop: false` → `setLoop("once", 1)` +
  `clampWhenFinished`, `startTime` seeds the action, `restPoseReset` defaults
  true and routes to `applyPoseMixer(dt, {restPoseReset})`.
- Per-actor state lives in a `WeakMap<TypedGLBActor, {baseAction, activeClip,
  lastTimeMs}>` because `ProductionRuntimeActorEntry` is rebuilt per frame.
- Per-actor dt: `rawDt * appScale * actorHandleTimeScale` — `appScale` via the
  `setActorAnimationAppTimeScale` seam (app.time.scale, prd08 to wire);
  `handle.timeScale` read structurally (stub 1 today).
- `rootMotion` spec + `clipSamples` binding + empty poses bypass the mixer path
  (root-motion/binding branches unchanged).
- `PoseMixer.activeActions()` added; `GLTFSceneAnimationRuntime.applyPoseMixer`
  evaluates the mixer pose (bone TRS writes), resets uncovered channels to rest
  (`restPoseReset` default), and keeps non-pose tracks on the legacy
  accumulator path sampled at each action's clock/effective weight.

## T1.10 — C-19 handle members + spec-field wiring

- `actorAnimationHandle.ts`: `Prd06ActorAnimationApi` (extends the PR 0a stub)
  implements `crossFadeTo`/`playLayer`/`stopLayer`/`animationState` against the
  actor's PoseMixer. `registerPrd06AnimationActor(actor)` (called by the
  `prd06.animation` actor extension on load, removed on dispose) is the
  handle→actor link; every member checks `A3D_QR_ANIMATION` per call and falls
  back to stub semantics when off/unloaded (C-37 conformance).
- New runtime members: `PoseMixer.baseAction()` +
  `activeActionEntries()` (layer-annotated) for `animationState()`;
  `PoseCrossFadeOptions.weight`/`additive` forwarded to the fade-in action;
  `GLTFSceneAnimationRuntime.ensureAdditiveClip(clip, ref)` lazily compiles a
  `makeClipAdditive` variant under `clip#additive:{ref|self}:{time}`;
  `skeletonJointNames()` for mask binding.
- `compiler/animation.ts` wires the remaining C-19 spec fields in the mixer
  block: `fallback` (per-node override, flag-gated), `layer` (plays the clip on
  a named layer — old layer actions fade out over `crossFade`), `weight`,
  `mask` (`createBoneMask` over the runtime skeleton), `blendMode: "additive"`
  + `additiveReference` (synthesized additive clip + additive action).
- `diagnosticOnly.prd06.ts` (open on PR #343) loses its wired spec rows
  (crossFade/transition/warp/syncGroup) once T1.10 merges.
- Tests: 3 new cases in `animation-controller.test.ts` (real PoseMixer — drive
  members + snapshot shape, additive layer, flag-off stub conformance).

## T1.11 — AnimationMixer facade + blendStates delegation (A3D_QR_ANIMATION_POSE_MIXER)

- New `pose/poseMixerFlags.ts`: `setPoseMixerBlendFlagProvider` /
  `poseMixerBlendEnabled`. `@aura3d/animation` cannot import the engine flag
  machinery (dependency direction is engine → animation), so the engine lane
  barrel (`packages/engine/src/lanes/prd06.ts`) installs the provider reading
  `qrAnimationFlags().on("A3D_QR_ANIMATION_POSE_MIXER")`; env fallback reads
  `A3D_QR_ANIMATION_POSE_MIXER` directly (multi-word sub-flags cannot be
  `A3D_QR=` list tokens — the resolver's short-name form is `lane.sub`).
- New `pose/blendKernels.ts`: value-level r185 kernels (`blendBaseValue`,
  `additiveContributionValue`, `applyAdditiveValue`, `combineAdditiveValue`),
  the `AnimationValue` twins of `PoseMixer`'s flat-buffer math.
- `AnimationMixer.blendBase`/`additiveContribution` route through the kernels
  under the flag (identical math, single source; legacy bodies stay for flag
  removal). Public API unchanged.
- `AnimationController.blendStates` (`packages/animation`, :663): when every
  weighted state's clip carries keyframe `tracks`, delegates to
  `PoseMixer.evaluateSamples` over a skeleton synthesized from the track
  targets — r185 incremental weights with rest-fill instead of renormalise.
  Sampler-function clips keep the legacy path with a one-time E38 warning.
  Morph weights keep the legacy renormalised accumulation on both routes.
- `animation.mixer: "pose"` alias: `qrFlagsWithAnimationMixer` composes the
  sub-flag onto resolved `QrFlags` at both app resolve sites
  (`createAuraApp`, `frameLoop`); an explicit flags-input value for the
  sub-flag wins.
- Tests (`game-animation-runtime.test.ts`, each cites the r185 value):
  weight 0.3 clip → x = 10·0.3 + 0·0.7 = 3 (rest-fill vs legacy renormalise);
  flag-off tracks-only clip yields `emptyPose` (the E38 blind spot);
  0.5/0.5 pair → x = 5 (incremental mix t = w/(Σ+w)); sampler clip → legacy +
  warn-once; facade parity + slerp(identity, 90°Y, 0.5) = 45°Y.
  `C-00-flags.test.ts` covers the `animation.mixer` alias.

## T1.12 — bone-texture-only skinning for `a3d_prd06_skinning_common`

- `applySkinningUniformsCached` gains a chunk-program branch
  (`SkinningUniforms.ts`): any program declaring `u_boneTexture` binds the
  cached bone texture for EVERY joint count — no `u_jointMatrices`/
  `u_jointPaletteMode` needed. `u_jointCount` is set only when declared (the
  chunk doesn't), `u_prevBoneTexture` only when declared.
- `u_jointMatrices` is uploaded on the chunk path ONLY when
  `device.kind === "webgpu"` — WebGPU still consumes the uniform array until
  Q-11-1. WebGL2 chunk programs never see it.
- Shared binder: `bindBoneTextureForSkinning` (exported via `lanes/prd06`)
  is the common cache-pair bind used by the depth feature's `bindBoneTexture`
  and the new uniforms-map path — same dedupe-per-frame semantics.
- `decideSkinningPalettePath` gains `shaderHasBoneTexture`: chunk programs
  now record `data-texture`/`none-bone-texture` (was `cpu` for lacking all
  legacy uniforms); over the cache ceiling it reports
  `joint-count-exceeds-bone-texture-limit`. `recordDecision` in
  `forward/Deform.ts` passes the new input and `bind` accepts the device so
  the webgpu joint-array upload reaches the call site.
- Unstamped palettes on chunk programs hit `applySkinningUniforms`'s contract
  and throw (no `u_jointMatrices` to fall back to) — correct: chunk
  consumption requires the stamped C-18 path.
- Flag-off byte-identical: the new branch is behind `u_boneTexture`
  reflection + the same stamped-key gate as before; legacy programs hit the
  identical pre-existing codepath.
- Unit (`skinning-palette-cache.test.ts`): 65- and 191-joint stamped palettes
  bind `u_boneTexture`/`u_boneTextureWidth`/`u_prevBoneTexture`, never
  `u_jointMatrices`/`u_jointPaletteMode`; webgpu backend still gets
  `u_jointMatrices`; legacy program keeps `u_jointMatrices` ≤96; unstamped →
  contract throw. `decideSkinningPalettePath` cases in
  `skinning-fallback-and-bounds.test.ts` (65/191 GPU path, 2048 cpu).
- Browser (`deform-light-view`): new `?rig=synthetic-191` mode — a procedural
  191-joint ribbon rig (each vertex weighted to one joint, posed palette curls
  ~0.9 rad) drawn through the real `a3d_prd06_skinning_common` chunk;
  spec asserts joints=191 and the same IoU bars (deformVsCpu ≥0.98,
  bindPoseGpuVsCpu ≥0.98, controls <0.8).
