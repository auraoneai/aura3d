# V9 Render Loop, Camera, And Culling

G3D has a real renderer frame path with camera handling, resize support, culling, diagnostics, and render-loop helpers. Some camera-layout parity remains partial.

## Real Code

- `packages/rendering/src/Renderer.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/SceneOptimization.ts`
- `packages/rendering/src/performance/RenderItemSorting.ts`
- `packages/rendering/src/v9/RendererV9.ts`
- `packages/engine/src/v9/G3DRenderer.ts`
- `apps/v9-public-scene/src/main.ts`

## What Is Supported

- `Renderer.create()`, `render()`, `renderAsync()`, `captureFrame()`, `resize()`, and `resizeToDisplay()`.
- `G3DRenderer` wrapper with animation-loop and diagnostics access.
- Camera-like inputs and render-source camera policy.
- Scene traversal through first-party scene objects and render sources.
- Frustum culling and visible-object diagnostics.
- Draw-call and resource diagnostics.

## Evidence

- `tests/reports/v9/route-health.json`
- `tests/reports/v9/same-scene-render.json`
- `tests/reports/v9/api-surface.json`
- `apps/v9-public-scene/`

## Remaining Deltas

- `webgl_multiple_elements` and `webgl_multiple_views` remain partial.
- WebXR frame submission and camera/projection integration remain partial.
- Route startup/visual quality still varies by example; a passing route-health report is not a guarantee of polished UX.
