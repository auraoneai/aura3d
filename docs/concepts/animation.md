# Animation

Version: `1.0.0`

Aura3D animation is a runtime system for clips, tracks, mixers, layers, skeletal data, morph weights, root motion, IK, and motion diagnostics.

## Code

- `packages/animation/src/index.ts`
- `packages/assets/src/GLTFAnimationRuntime.ts`
- `packages/rendering/src/ForwardPass.ts`
- `tests/unit/animation/`
- `tests/browser/current-routes-animation-examples.spec.ts`

## Runtime Shape

Use `@aura3d/engine/animation` for low-level animation primitives and `@aura3d/engine/assets` for imported glTF animation runtime helpers.

Browser routes under `apps/animation-*` and `apps/skinning-*` demonstrate selected imported animation workflows.

## Boundary

The current system is package-backed and route-tested, but every character rig, DCC export, retargeting graph, and animation authoring workflow still needs specific evidence before being documented as supported.

## Current Limits

Animation support is runtime-focused. Broad retargeting, DCC authoring, production character pipelines, and every imported rig convention need dedicated fixtures, browser evidence, and documentation before being treated as supported.

## Current Limits

- Animation support is runtime-focused; full authoring, broad retargeting, and production character-pipeline claims remain out of scope until backed by tests and reports.
