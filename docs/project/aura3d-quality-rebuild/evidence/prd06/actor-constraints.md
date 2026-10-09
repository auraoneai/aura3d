# PRD-06 T3.5 — Constraint list on the actor (`node.animation.ik`)

> **06-REC note (finish phase, G3):** this file cites no passing remote run id; every completion claim below is recorded as **unbacked** until a green lane-workflow/GitLab run id is added next to it.


## Runtime seam (`packages/assets/src/GLTFAnimationRuntime.ts`)
- `GLTFPoseConstraint { bones: readonly number[]; evaluate(pose, binding, modelMatrix, {dt}) }`.
- `addPoseConstraint(c)` → disposer (identity removal — a duplicate spec stays); `clearPoseConstraints()`; `poseConstraintCount()`.
- `setPoseConstraintModelMatrix(provider)` — world→model matrix source; defaults to `scene.root.transform.worldMatrix`.
- `runPoseConstraints` evaluates entries **in insertion order after the mixer writes the pose and before `applySampledTargets` builds skinning palettes**, in both `applyClips` (stateless evaluateSamples path, dt = 1/60) and `applyPoseMixer` (real dt); touched bones union into the emitted sampled targets so constraint writes land even on clip-uncovered bones.
- Flag-off cost: empty list → a length check. No flag-off behaviour change.

## Spec factory (`packages/engine/src/production-runtime/actor/TypedGLBActorAnimation.ts`)
- `Prd06ConstraintSpec` — lane-internal typed union (CCR-06-4 pending): `{kind:"two-bone"|"foot-ik"|"look-at"|"ccd"}` over the T3.1–T3.4 spec shapes; world `target` accepts `AuraVec3 | string /* node id-or-name */ | {socket: bone}`.
- `createPrd06PoseConstraint(spec, {binding, resolveTarget})` → `GLTFPoseConstraint` — resolves each spec's bone union at add time (`PRD06_CONSTRAINT_UNKNOWN_BONE`), instantiates stateful solvers (look-at spring) per entry.
- `addPrd06ActorConstraint(actor, spec, resolveTarget)` → disposer; `clearPrd06ActorConstraints(actor)`.
- `constraintInert` gate: weight-0 specs stay registered but evaluate as a bitwise no-op — the emitted pose equals the pure clip exactly.

## Handle (`packages/engine/src/agent-api/app/actorAnimationHandle.ts`)
- `Prd06ActorAnimationApi.ik` override: `add(spec)` → actor-runtime constraint + disposer; `clear()`; degrades to stub while flag off / actor unloaded.
- `prd06ConstraintTargetPosition`: `{socket}` → live bone world-matrix translation (T0.18 bone source); `string` → scene node id-or-name world translation; null → constraint skipped for that frame, never faked.

## Gates
- `tests/unit/assets/gltf-pose-constraints.test.ts` — 7/7 green: insertion order observed, order sensitivity (non-commutative quat proof), weight-0 bitwise-equal, disposer identity semantics, `clear()`, live two-bone bend post-mixer, constraint-covered bones emitted on clip-uncovered joints.
- `pnpm exec vitest run tests/unit/animation/ tests/unit/assets/gltf-pose-constraints.test.ts` → green; eslint + tsc clean on touched files.
