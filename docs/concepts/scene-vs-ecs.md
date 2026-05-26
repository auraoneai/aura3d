# Scene Graph Versus ECS

Version: `0.1.0-alpha.0`

Galileo3D exposes both scene graph and ECS-style runtime concepts. Use them for different jobs and bridge them deliberately.

## Scene Graph

Use the scene graph when hierarchy and authored spatial relationships matter:

- imported glTF node trees;
- cameras, lights, and transforms;
- parent/child transform inheritance;
- editor hierarchy panels;
- product scene authoring;
- renderer-facing objects with stable visual identity.

Relevant packages:

- `@galileo3d/engine/scene`;
- `@galileo3d/engine/v9`;
- `@galileo3d/engine/assets`;
- `@galileo3d/engine/editor-runtime`.

## ECS

Use ECS when behavior is data-oriented, repeated, and scheduled:

- gameplay state;
- many similar objects;
- fixed system ordering;
- physics synchronization;
- simulation or interaction state that does not need authored hierarchy.

Relevant package:

```ts
import { World } from "@galileo3d/engine/ecs";
```

## Bridge Rule

Avoid two independent sources of truth for one transform. If physics drives a scene node, physics writes and scene reads. If editor commands drive a node, editor state writes and ECS systems observe or mirror intentionally.

## V9 Runtime Shape

`G3DScene` is a direct runtime scene surface for renderer usage:

```ts
import { G3DScene } from "@galileo3d/engine/v9";

const scene = new G3DScene();
scene.addGeometry("mesh", geometry);
scene.addMaterial("mat", material);
scene.createRenderableMesh({ geometry: "mesh", material: "mat" });
```

This is useful when you need explicit renderer-facing resource libraries. Imported assets and editor scenes may still carry richer authored hierarchy before conversion.

## Boundaries

The current repo proves bounded scene, ECS, physics, editor, and renderer integration slices. It does not prove a large production editor where every object has a complete ECS mirror, a mature prefab system, or a full game-engine composition model.

## Boundary

The package boundary is that scene graph owns authored hierarchy while ECS owns scheduled data-oriented behavior.

## Current Limits

Current limits include full editor-scale prefab mirroring, complete ECS scene ownership, and large production composition workflows.
