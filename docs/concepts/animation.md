# Animation

Version: 2.0.2

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

Explicit limits (see `docs/project/status/known-limits.md`): motion matching is a deterministic fixture, not a production search/runtime system; critically damped inertialized transitions are implemented at package level, but they do not establish broad root character-pipeline support; ragdoll is a physics-sandbox preset with no controller, joint limits, or animation-to-physics blend; full-body IK / FABRIK / CCD IK are not implemented (only two-bone and bounded foot-IK systems); production cloth and hair simulation remain fixtures; Unity Mecanim / Unity Animation Rigging / Unreal Control Rig parity is not a goal.
