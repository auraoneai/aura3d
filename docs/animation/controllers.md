# Animation Controllers: which one to use

Aura3D ships two `AnimationController` implementations. They are independent — the engine one is
NOT a subclass or wrapper of the package one; it reuses the package's types/registry and
reimplements playback for runtime node binding.

## `@aura3d/animation` — `AnimationController` (package, ~1017 lines)

Use this for headless / logic-level animation: clip registry, weighted clip blending, crossfade,
pose capture, animation events, and `bindAnimationTimelineAction`. It does not bind to scene nodes
itself (explicit `AnimationLayer` masks live in `AnimationMixer`). Best for tests, tools, and code
that samples poses without a renderer.

```ts
import { createAnimationClipRegistry, AnimationController } from "@aura3d/animation";
```

## `@aura3d/engine` — `AnimationController` (engine runtime, 3339 lines)

Use this in a running app. It adds runtime node binding (`bindRuntimeNode`), per-layer weights
(`registerLayerMetadata`), embedded-GLB clip registration (`registerEmbeddedGLBClips`),
retargeting, and pose-baked fallbacks. This is what drives an on-screen skinned character each
frame alongside the `FrameLoop`.

```ts
import { createAnimationController } from "@aura3d/engine";
```

## Rule of thumb

- Composing/sampling animation logic, writing tests, building tools → package controller.
- Driving a visible character in a browser app → engine controller (or the higher-level
  `createGLTFSceneAnimationMixer` / shot playback helpers).

Both share the deterministic state-machine core (`AnimationStateMachine` / `AnimationStateGraph`)
and the same clip-map readiness validators (`validateAnimationClipMap`, `validateAnimationClipMap`).
