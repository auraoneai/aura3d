# Three.js Migration Guide

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Keywords: Three.js developer quick map migrate raw Three.js.

## Three.js Developer Quick Map

| Three.js | A3D V5 |
| --- | --- |
| Scene | SceneCompat |
| WebGLRenderer | createRendererV5 |
| OrbitControls | @aura3d/controls OrbitControls |
| GLTFLoader | GLTFLoaderV5 |
| EffectComposer | EffectComposerCompat |

## What Still Requires Raw Three.js Or Another Engine

Full Three.js ecosystem parity, Unity replacement, Unreal replacement, and broad performance superiority remain blocked unless the release gates provide external evidence.

## Snippet 1

```ts
import { createRendererV5 } from "@aura3d/rendering";
import { SceneCompat } from "@aura3d/three-compat";

const renderer = createRendererV5({ width: 800, height: 600 });
const scene = new SceneCompat();
console.log(renderer.captureScreenshot(), scene.type);
```

## Snippet 2

```ts
import { createRendererV5 } from "@aura3d/rendering";
import { SceneCompat } from "@aura3d/three-compat";

const renderer = createRendererV5({ width: 800, height: 600 });
const scene = new SceneCompat();
console.log(renderer.captureScreenshot(), scene.type);
```

## Snippet 3

```ts
import { createRendererV5 } from "@aura3d/rendering";
import { SceneCompat } from "@aura3d/three-compat";

const renderer = createRendererV5({ width: 800, height: 600 });
const scene = new SceneCompat();
console.log(renderer.captureScreenshot(), scene.type);
```

