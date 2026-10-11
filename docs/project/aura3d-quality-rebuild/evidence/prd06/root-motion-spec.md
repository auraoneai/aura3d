# T3.7 — spec-level `play(clip, {rootMotion})` (PRD-06 §6.8, C-19 `AuraRootMotionSpec`)

> **06-REC note (finish phase, G3):** this file cites no passing remote run id; every completion claim below is recorded as **unbacked** until a green lane-workflow/GitLab run id is added next to it.


**Branch:** `qr/prd06-pose-foundations` · **Gates:** 6/6 new unit tests, neighboring suites green, tsc + eslint clean.

## What landed

`node.animation.rootMotion` as a spec object (the `play(clip, options)` surface —
`RuntimeNodeHandleLike.play(clip, options)` lowers onto the same `node.animation`
spec) now drives the carved root-motion machinery for any clip, generalised from
the controller-binding-only path in `compiler/animation.ts`:

- `applyProductionActorAnimation` gains a spec-level branch (before the
  clip-samples/mixer/playClip fallback). Per-entry cursors keyed
  `root-motion:<runtimeId|actorId>:<clip>` track unwrapped clip seconds
  (`time/1000 - startTime + captureTime`), so `extractLoopingDelta` sees real
  wrap crossings; `resolveAnimationSeconds`'s own modulo is not used for the
  cursor.
- `spec.bone` resolves through a new `runtime.rootMotionTargetFor(clip, bone)`:
  `${bone}.translation` / `${bone}.position` when named, else the clip's
  root-motion candidate (largest planar displacement on a hips/root/pelvis
  node, then any translation track by displacement).
- `spec.axes` masks the applied world delta per component; `"yaw"` extracts the
  root's Y-rotation via `runtime.rootMotionYawDelta` (continuous-loop-aware:
  same-cycle atan2 delta + per-cycle contribution per wrap crossing).
- `mode: "apply"` integrates into the node transform: `runtimeNodes.get(id).translate`
  (+ `setRotation` for yaw) when the node is mutable, else an accumulated
  `entry.rootMotionOffset`/`rootMotionYaw` folded into the model matrix by
  `applySpecRootMotionTransform` in `renderInput` — before foot planting and
  draw, and again inside `refreshAfterMovement` so the refresh sees the move.
- `mode: "extract-only"` moves nothing; the `RootMotionConsumption`
  (`requested/accepted/rejected` + `yawDelta`) is recorded on
  `entry.rootMotionReport` — the CCR-06-3 `consumer` callback lands on the same
  record when that request merges.
- `animation.rootMotion` row removed from `DIAGNOSTIC_ONLY_FIELDS` (wired by
  PRD-06 now; remaining `animation.*` rows clear as their consumers land).
- Flag-off and `rootMotion: false` keep the legacy path byte-identical; a
  controller `binding.rootMotion` still wins over the spec path.

## Unit evidence (`tests/qr/prd06/unit/root-motion-spec.test.ts`, 6/6)

- Real `GLTFSceneAnimationRuntime` + walk clip (1 m/cycle forward Z): 2.5 s of
  playback moves the runtime-node handle 2.5 m ± 1 cm across a loop wrap; the
  pose hips stays at the authored `t=0` sample `[0,1,0]` (delta removed from
  pose), X/Y untouched.
- No runtime handle → offset+yaw fold into the model matrix (a 90°/cycle `turn`
  clip rotates the basis ~180° over two cycles).
- `extract-only`: no translate/no offset; report carries `requested≈[0,0,1]`,
  `accepted=[0,0,0]`, `rejected≈[0,0,1]`.
- `axes:["x"]` masks Z: rejected ≈ 1 m, node unmoved.
- Flag-off → legacy `playClip`; `rootMotion:false` → PoseMixer path, no report.

## Semantics recorded

- `axes` masks the **world-space** delta after `worldFromLocal` transform;
  masked components are rejected, not re-authored into the pose (documented).
- Yaw applies about the node's local Y (`setRotation`/basis rotate); a rotated
  rig composes correctly only for world-Y-aligned up axes — noted for T4 hero
  wiring.
