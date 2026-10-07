# Q-06-3 — lane 06 converges `@aura3d/animation` index names onto their owners

- **Requester:** lane 15 (PRD-15 T5.8, `unique-ownership` gate)
- **Owner:** lane 06
- **SLA:** 2 working days
- **Files:** `packages/animation/src/Keyframe.ts`, `AnimationAction.ts`, `AnimationStateMachine.ts`, `FootIk.ts`, `MotionQuality.ts`, `AnimationController.ts` (see Q-06-4)

## What

`unique-ownership` (now fail-mode) fails when one name is exported by two
package indexes with different declarations. The animation package index
re-exports these names that already belong to another package:

| Name | Canonical owner | Animation-side declaration |
|---|---|---|
| `Vec3`, `Quat`, `Mat4`, `vec3`-math helpers | `@aura3d/scene/math` (`scene/src/MathTypes.ts`) | `animation/src/Keyframe.ts` |
| `normalizeQuat`, `identityMat4`, `composeMat4`, `multiplyMat4` | `@aura3d/scene/math` | `animation/src/Keyframe.ts` |
| `LoopMode` | `@aura3d/core` (`core/src/EngineLoop.ts`) | `animation/src/AnimationAction.ts` |
| `StateTransition` | `@aura3d/scripting` (`scripting/src/StateMachine.ts`) | `animation/src/AnimationStateMachine.ts` |
| `GroundRaycaster` | engine contract `contracts/world.ts` | `animation/src/FootIk.ts` |

## Ask

Import the shared declarations instead of re-declaring them: point
`Keyframe.ts`'s math at `@aura3d/scene/math` (same migration as the spec's
Q-06-3 property test — 1,000 random TRS at 1e-6), alias or drop the colliding
`LoopMode`/`StateTransition`/`GroundRaycaster` exports, or rename the
animation-side export. Until then each pair sits in the dated
`tools/arch-gates/allowlist.json` and does not fail the gate.
