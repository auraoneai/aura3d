# Scene Graph Versus ECS

Version: `1.0.0`

Aura3D has both a scene graph package and an ECS package. They serve different roles.

## Scene Graph

Use `@aura3d/engine/scene` for Object3D-style hierarchy, transforms, cameras, lights, renderables, instancing, serialization, and renderer traversal.

Important code:

- `packages/scene/src/Object3D.ts`
- `packages/scene/src/Renderable.ts`
- `packages/scene/src/Camera.ts`
- `packages/scene/src/Light.ts`

## ECS

Use `@aura3d/engine/ecs` for entity/component/system style runtime organization.

Important code:

- `packages/ecs/src/index.ts`
- `packages/ecs/tests/ecs.test.ts`

## Boundary

Renderer-facing examples mostly use scene graph structures. ECS is available for runtime organization, but docs should not imply every scene feature has an ECS-first authoring path unless that path exists in code and tests.

## Current Limits

Scene graph and ECS APIs are both available, but not every scene feature has a mirrored ECS authoring workflow. Claims should stay tied to package APIs, examples, and tests that exercise the specific path.

## Current Limits

- Scene and ECS APIs coexist, but not every scene feature has a complete ECS authoring workflow.
