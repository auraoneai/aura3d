# V9 Resource Lifecycle

A3D has explicit disposal and resource diagnostics. This is a real code area and a key V9 advantage, but long-run leak freedom still needs broad route soak coverage.

## Real Code

- `packages/core/src/Disposable.ts`
- `packages/core/src/ResourceScope.ts`
- `packages/rendering/src/Geometry.ts`
- `packages/rendering/src/Material.ts`
- `packages/rendering/src/RenderDevice.ts`
- `packages/rendering/src/WebGL2Device.ts`
- `packages/rendering/src/Renderer.ts`
- `packages/engine/src/advanced-runtime/A3DAppLifecycle.ts`
- `packages/engine/src/advanced-runtime/A3DScene.ts`

## What Is Supported

- Explicit `dispose()` patterns.
- Renderer/device disposal.
- Geometry and material disposal.
- Render-target/resource accounting.
- V9 app lifecycle cleanup for disposables, animation frames, and event listeners.
- Package and route diagnostics for resource state.

## Evidence

- `apps/public-scene/`
- `tests/reports/v9/api-surface.json`
- `tests/reports/v9/route-health.json`
- Existing resource lifetime and render-state leak tests referenced by V9 status tooling.

## Remaining Deltas

- More repeated route-load/unload soak coverage is needed across every app.
- WebGPU resource lifecycle evidence remains partial.
- External consumer leak testing is currently smoke-level, not exhaustive.
