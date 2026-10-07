# PRD-06 evidence — CompiledClip + PoseMixer (T1.2, T1.3)

Branch: `qr/prd06-pose-foundations`. Parity target: three r185 `AnimationMixer`/`AnimationAction` semantics within 1e-4 (quats up to sign) across soldier.glb, fox.glb, CesiumMan.glb, RobotExpressive.glb.

## What landed

| Task | Artifact | Status |
|---|---|---|
| T1.2 | `packages/animation/src/pose/CompiledClip.ts` — flat `Float32Array` times/values per track, per-action `Uint32Array` cursor with monotone-forward interval search, LINEAR / STEP / glTF CUBICSPLINE (quats normalized directly). Equality to `AnimationTrack.sample` within 1e-6 over 1000 random times; hot-loop sample ≤ 25 µs | implemented, 4/4 tests |
| T1.3 | `packages/animation/src/pose/PoseMixer.ts` — §6.4 base blend with rest fill, override + additive layers, BoneMask weights, fades, `crossFadeFrom`/`crossFadeTo` (incl. warp), `syncWith`/`syncGroup`, `setEffectiveTimeScale`, loop modes (`repeat`/`once`/`pingpong`), per-(bone,channel) incremental accumulate `mix(acc, vᵢ, wᵢ/(Σ+wᵢ))`, additive accumulator identity-init | implemented, 24/24 parity tests |

## three r185 semantics ported verbatim

- `Quaternion.slerpFlat` (`quatFlat.ts`): early copy only when all four components `!==`; `dot < 0` negates; `dot < 0.9995` → acos/sin slerp; else lerp + normalize. **No** `cos ≥ 1` early-exit — near-identical float32 quats still lerp to the true midpoint (a `cos ≥ 1` shortcut produced ~2–5e-4 drift).
- `AnimationMixer`: `time > end` strict end-detection on fades and warps; `warp()` is a **multiplicative** timescale interpolant (`values = [start/base, end/base]`, `this.timeScale` base unchanged) — treating it as absolute double-applies the start ratio (`crossfade with warp` frame-0 diff ~4e-3 before fix).
- `crossFadeFrom`: `fadeOut.warp(1 → fadeOutDur/fadeInDur)`, `fadeIn.warp(fadeInDur/fadeOutDur → 1)`, `_restoreTimeScale` saved before warp; `stopWarping` clears `_restoreTimeScale`.
- `makeClipAdditive` marks clips via `isClipAdditive` (WeakSet) so `PoseMixer` routes them through `accumulateAdditive` without an explicit flag.

## Bug fixed en route

`lerpVec3Flat` read `b[aOffset+k]` for components 1–2 instead of `b[bOffset+k]` — NaN-poisoned y/z of every vec3 channel for boneIndex > 0 whenever a second action mixed in (multi-action, crossfade, warp cases). Diff signature (only y/z, only vec3, only bones > 0) localized it.

## Runs

- `pnpm exec vitest run tests/unit/animation/pose-mixer-three-parity.test.ts tests/unit/animation/compiled-clip.test.ts` — **28/28 pass** (2026-10-07): single clip, weight 0.3 + rest fill, three actions 0.5/0.3/0.4, crossfade t=0.1/0.2, crossfade + warp, `makeClipAdditive` within 1e-5, all four rigs × 120 frames @ 1/60 dt.
- `pnpm exec vitest run tests/unit/animation/` — 268/269 pass; the one failure is `animation-runtime-node-source-gates.test.ts`, a pre-existing red on main (expects `node.animation = { ...options, clip };` in `agent-api/index.ts`, refactored by QR-13 merges — file/pattern diverged on main before this branch).
- `pnpm typecheck:raw` — 55 errors, identical to the `tools/threejs-parity-*` baseline on main.
- `pnpm exec eslint` on all touched files — clean.

## NOT RUN

- Browser/pose consumer paths — `PoseMixer` is still a standalone pipeline; actor wiring lands with T1.10/T1.11 (`animationState()`, `A3D_QR_ANIMATION_POSE_MIXER` routing).
