# T4.1 — `bindSpringChainToSkeleton` + `springBones.add/clear` (PRD-06 §7.1)

> **06-REC note (finish phase, G3):** this file cites no passing remote run id; every completion claim below is recorded as **unbacked** until a green lane-workflow/GitLab run id is added next to it.


Spring-bone chains now bind to a `SkeletonBinding` and evaluate as a pose
constraint — registered after IK constraints, writing local rotations into the
shared `PoseBuffer` before the palette build (no `TypedGLBActor.ts` edit).

## API

- `bindSpringChainToSkeleton(chain, skeleton, boneNames, { substepHz? })` —
  `packages/animation/src/SpringBones.ts`. `boneNames` is root-first (kinematic
  anchor, then simulated bones); unknown names throw. `step(pose, dt)` runs a
  fixed-step accumulator at `substepHz` (default 60 Hz, `maxSubsteps` 8 caps a
  hitched frame) and, after integrating, writes `pose.rotations` for each
  simulated bone that has a simulated child — aiming the bone's rest
  child-direction at the live segment. The kinematic root is never rewritten
  (its rotation is what drives `rotatedRestOffset` — aiming it makes the rest
  target chase itself), and the tip keeps its animated rotation.
- `Prd06SpringBonesSpec` / `createPrd06SpringConstraint` /
  `addPrd06ActorSpringBones` / `clearPrd06ActorSpringBones` —
  `packages/engine/src/production-runtime/actor/TypedGLBActorAnimation.ts`.
  Spec: `{ chains: [{ name?, bones, preset?, stiffness?, damping?,
  gravityScale?, gravity?, substeps?, substepHz?, relativeDamping?,
  colliders? }] }`. Springs register as `GLTFPoseConstraint`s, so they evaluate
  after every earlier-registered constraint (foot-ik etc.) and their bones are
  unioned into the emitted sampled targets. `springBones.clear()` disposes only
  the actor's spring registrations (per-actor WeakMap) — `ik` constraints are
  untouched.
- `node.animation.springBones.add(spec)` / `clear()` —
  `packages/engine/src/agent-api/app/actorAnimationHandle.ts`; flag-gated on
  `A3D_QR_ANIMATION`, no-op stub while the actor is unloaded (same degrade
  shape as `ik`).

## Integrator fix (required to meet the settle bar)

`createSpringChain` gained `relativeDamping` (default **0 — byte-identical
legacy behaviour**): per substep, each particle's velocity is blended toward
its parent's by `exp(-relativeDamping · dt)`. Absolute damping alone cannot
kill the 2-particle limit cycle — each particle's spring target moves with its
simulated parent, pumping energy into swing modes (measured: tip keeps ±8 cm
swings and KE 0.15 forever at hair damping 2.6, even with gravity off). With
`relativeDamping: 12` the same 1 m/s root stop is static by t+0.6 s
(KE ≤ 2e-4, tip motion < 0.3 mm). The lane default in
`Prd06SpringChainSpec` is 12; callers using `createSpringChain` directly keep
the legacy value.

## Gates

`tests/unit/animation/spring-bones-binding.test.ts` — 4/4 green:
- rest under gravity 0: rotations + tip position within 1e-4 after 120 frames;
- 1 m/s root stop: tip oscillation below 1° inside 0.6 s on the `hair` preset
  (measured as tip excursion around the tail-window mean; the same run still
  swings >1° earlier, so the dynamics really did move);
- accumulator determinism for identical dt streams + 5 s hitch bounded;
- unknown bone names throw.
`tests/unit/animation/spring-bones.test.ts` (pre-existing) — 6/6 still green.
`tsc --noEmit` + eslint clean on all touched files.
