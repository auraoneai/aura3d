# Animation

Version: 1.0.5

Aura3D animation is a runtime system for clips, tracks, mixers, layers, skeletal data, morph weights, root motion, IK, and motion diagnostics.

## Code

- `packages/animation/src/index.ts`
- `packages/assets/src/GLTFAnimationRuntime.ts`
- `packages/rendering/src/ForwardPass.ts`
- `tests/unit/animation/`
- `tests/browser/current-routes-route-health.spec.ts`
- `tests/browser/advanced-examples-gallery.spec.ts`

## Runtime Shape

Use `@aura3d/engine/animation` for low-level animation primitives and `@aura3d/engine/assets` for imported glTF animation runtime helpers.

Current animation browser coverage is represented by the consolidated root route registry, the accepted advanced gallery routes, and the allowed `apps/wow-*` showcase routes.

## Aura3D advantage

The current system is package-backed and route-tested, but every character rig, DCC export, retargeting graph, and animation authoring workflow still needs specific evidence before being documented as supported.

## AI Scene Usage

AI scene prompts can request motion cues, camera moves, and timeline beats. Those requests compile into supported animation primitives or diagnostics. Unsupported rigging, facial animation, cloth, hair, or full DCC authoring requests must stay visible as unresolved or approximated items instead of being hidden behind broad AI claims.

## Boundary

The animation boundary is `@aura3d/engine/animation` for runtime primitives and `@aura3d/engine/assets` for imported glTF animation helpers. Claims about clip retargeting, IK layers, or skinning must cite the specific package API and test that backs them.

## Current Limits

Animation support is runtime-focused. Broad retargeting, DCC authoring, production character pipelines, and every imported rig convention need dedicated fixtures, browser evidence, and documentation before being treated as supported.

Explicit non-goals (NOT provided as production systems; see `docs/project/known-limits.md`): motion matching is a deterministic fixture, not a real engine; inertialization is not implemented; ragdoll is a physics-sandbox preset with no controller, joint limits, or animation-to-physics blend; full-body IK / FABRIK / CCD are not implemented (only two-bone IK); production foot-locking, spring-bone, cloth, and hair simulation are fixtures; Unity Mecanim / Unity Animation Rigging / Unreal Control Rig parity is not a goal.
