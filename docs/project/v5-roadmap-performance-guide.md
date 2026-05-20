# Performance Guide

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Keywords: large scenes instancing BVH profiling.

## Snippet 1

```ts
import { createRendererV5 } from "@galileo3d/rendering";
import { SceneCompat } from "@galileo3d/three-compat";

const renderer = createRendererV5({ width: 800, height: 600 });
const scene = new SceneCompat();
console.log(renderer.captureScreenshot(), scene.type);
```

## Snippet 2

```ts
import { createRendererV5 } from "@galileo3d/rendering";
import { SceneCompat } from "@galileo3d/three-compat";

const renderer = createRendererV5({ width: 800, height: 600 });
const scene = new SceneCompat();
console.log(renderer.captureScreenshot(), scene.type);
```

## Snippet 3

```ts
import { createRendererV5 } from "@galileo3d/rendering";
import { SceneCompat } from "@galileo3d/three-compat";

const renderer = createRendererV5({ width: 800, height: 600 });
const scene = new SceneCompat();
console.log(renderer.captureScreenshot(), scene.type);
```

