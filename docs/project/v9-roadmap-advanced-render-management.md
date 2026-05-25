# V9 Advanced Render Management

G3D has real render-queue sorting, state caching, instancing, and diagnostics. Automatic broad batching and every Three.js performance pattern are not complete.

## Real Code

- `packages/rendering/src/performance/RenderItemSorting.ts`
- `packages/rendering/src/WebGL2StateCache.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/InstancedMesh`-related scene/rendering paths.
- `packages/rendering/src/SceneOptimization.ts`
- `tools/threejs-parity-performance/`
- `tools/threejs-parity-instancing-parity/`

## What Is Supported

- Opaque/transparent render queue sorting.
- Render-order handling.
- State-cache diagnostics for WebGL2 hot paths.
- Native WebGL2 instanced draw paths.
- Per-instance matrix submission for supported instancing routes.
- Resource and draw diagnostics.

## Evidence

- `tests/reports/v9/instancing-parity.json`
- `tests/reports/v9/performance.json`
- `tests/reports/v9/route-health.json`
- `tests/reports/v9/claim-registry.json`

## Remaining Deltas

- Broad automatic batching is not a completed public guarantee.
- WebGL1 instancing compatibility is not claimed.
- WebGPU instancing remains partial.
- Performance superiority is scoped to current reports only; it is not a global claim against Three.js.
