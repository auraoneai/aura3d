# T3.8 — `bakeRetargetedClips` + `addClipsFrom` (PRD-06 §7.2, R11)

Branch `qr/prd06-pose-foundations` / PR #346.

## Surface

- `packages/animation/src/pose/Retarget.ts` — `bakeRetargetedClips(source, target, options)`
  (PRD §7.2 signature) + `bakeRetargetedClipMap` (name-preserving form),
  `decompileCompiledClip`, `detectLimbFlips`, `humanoidRigForSkeleton`,
  `rigWithRestPose` (rest-pose fill for explicit rig defs).
- `packages/animation/src/pose/retarget.worker.ts` + `pose/RetargetWorker.ts` —
  module worker + single-use RPC wrapper; `createRetargetWorker()` returns
  `undefined` off-browser so callers fall back in-process.
- `packages/animation/src/pose/RetargetCache.ts` — IndexedDB store
  `aura3d-retarget/bakes`, key `(engineVersion, sourceHash, targetHash)`
  (`retargetCacheKey`); `AURA3D_RETARGET_ENGINE_VERSION` bumps invalidate the
  namespace, so a rollback ignores newer caches.
- `GLTFSceneAnimationRuntime.addClipsFrom(source, options)` — accepts
  `{skeleton, clips}` or another runtime (`skeletons()`/`compiledClips()`),
  caches/bakes (worker → in-process fallback), registers raw + compiled +
  mixer entries per name. `AddClipsFromRuntimeOptions` exported via
  `gltf-runtime.ts`.
- `AuraActorAnimationApi.addClipsFrom` (C-19 seam; `map` stays `unknown` until
  CCR-06-4) + `Prd06ActorAnimationApi` override — flag-off / un-loaded actor
  resolves `[]`.
- Exports through `@aura3d/animation/lanes` (`lanes/prd06.ts`).

## Bake semantics

- Per clip: union of all track keyframe times (clamped to duration) ∪
  `{0, duration}` → sample compiled tracks into an `AnimationPose` keyed by
  source node names → `retargetHumanoidPose` (rest-delta + facing + per-bone
  scale) → recompiled as linear `AnimationTrack`s on target node names.
- `normalizeMapToClip` resolves `binding.source.name` to the node the clip
  actually animates (`[name, ...aliases] ∩ clipNodes`, first hit) and re-anchors
  `sourceRest`/`sourceRestPosition` at that joint — fixes the mixamo `root` /
  `mixamorig:Hips` divergence where inference binds the alias, not the track.
- `hipsScale: "leg-length"` (default in `addClipsFrom`) = target/source
  lower-limb chain ratio measured from each skeleton's rest offsets
  (lowerLeg+foot+toes); a number pins a factor; `undefined` keeps the map's own
  hips scale.
- `fingers: true` carries same-named finger bones through the rest-delta path
  (scale 1).
- Emitted channels: rotation for every mapped bone; translation only where the
  mapped source bone carries a translation track (root motion + height);
  scale only where the source animates scale.
- `detectLimbFlips(clip, thresholdDeg = 120)` counts single-frame joint swings
  past the threshold (Phase-3 exit (a) metric).

## Evidence

`tests/qr/prd06/unit/retarget-bake.test.ts` — real GLBs
(`fixtures/threejs-parity/.../soldier.glb` → `fixtures/three-compat/.../cesium-man.glb`;
soldier rig inferred, cesium ordinal rig declared explicitly — `map.ok`):

- Baked `Walk`: 57 tracks / 1881 keyframes, all values finite.
- Hips lands on `Skeleton_torso_joint_1.translation`, values equal
  `tRest + (src − sRest) · legRatio` within 1e-4 (legRatio ≈ 0.0057 — cm→m
  units across rigs, so not a raw copy).
- `detectLimbFlips` = 0 over the full clip.
- `addClipsFrom` registers all 4 soldier clips on the cesium runtime
  (compiled map + `clipNames()`), and accepts a runtime as `source`.
- Bake cost measured: ~31ms first call, **~12–13ms steady state for the
  4-clip set** (156 tracks/clip) — inside R11's 5–30ms/clip-set band, and the
  IndexedDB cache makes repeat loads ~0ms.

`vitest run tests/qr/prd06/unit/retarget-bake.test.ts` — **3/3 green**.
Scoped `tsc` + `eslint` clean on all touched files.

## Not in this task

- §17.2 human review of the rendered retarget rides on the lane scene capture
  (T3.9 / Phase-5 showcase), not the unit battery.
- Pre-baked clip shipping via C-17 is the packaging step when the lane caches
  ship.
