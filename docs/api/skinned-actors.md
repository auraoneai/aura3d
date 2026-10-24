# Skinned and typed GLB actors in the app render loop

`cloneSkinned(asset, count, options)` returns typed GLB actors (`TypedGLBActor`). To draw them every frame, hand them to the app through `attachRootRenderSource`. Both are exported from the `@aura3d/engine` root, so a game needs no deprecated `@aura3d/engine/production-runtime` import.

```ts
import { attachRootRenderSource, cloneSkinned, type TypedGLBActor } from "@aura3d/engine";

const { actors, dispose } = cloneSkinned(asset, 1, { width: 1, height: 1, idPrefix: "runner" });
const runner: TypedGLBActor = actors[0]!;

const bridge = attachRootRenderSource(canvas, {
  source: { collectRenderItems: () => runner.collectRenderItems({ modelMatrix }) }
});
```

## `attachRootRenderSource(canvas, { source, onFrame? }): RootRenderSourceBridge`

- `source.collectRenderItems()` is called each frame and returns the items to draw.
- One source per canvas: attaching a second one to the same canvas throws until the first is detached.
- `RootRenderSourceBridge` is the returned handle type.

## Status

Moved to the root in 4.1.3. The `@aura3d/engine/production-runtime` copy stays until the 5.0.0 removal of the deprecated subpaths. Used by `examples/saiyan-snake-way-port`, `examples/ninja-runner-port` and `examples/parity-animation`.
