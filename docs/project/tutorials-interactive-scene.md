# Tutorial: Interactive Scene V3

This tutorial maps to `examples/foundation-interactive-scene` and `examples/foundation-game-slice`. It shows how to run a public workflow inside the renderer animation loop.

## Core API

```ts
import { createInteractiveSceneWorkflow } from "@galileo3d/workflows";

const workflow = createInteractiveSceneWorkflow({ preset: "orbiting-products" });

renderer.startAnimationLoop((timeMs) => {
  const source = workflow.update(timeMs / 1000);
  renderer.render(source, workflow.camera);
});
```

## What The Workflow Covers

- A realtime `update(timeSeconds)` function.
- Animated transforms.
- Auto-framed camera policy.
- Environment lighting and postprocess.
- Renderer diagnostics for draw calls and frame state.

## Boundary

This is a realtime viewport slice, not a claim that G3D replaces Unity, Unreal, or every Three.js use case.

## Verification

```sh
pnpm exec playwright test tests/browser/foundation-examples.spec.ts -g "foundation-interactive-scene|foundation-game-slice"
```
