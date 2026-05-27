# Rendering

Version: `1.0.0`

Aura3D rendering is implemented in the first-party `@aura3d/rendering` package and exposed through root package subpaths.

## Code

- `packages/rendering/src/index.ts`
- `packages/rendering/src/Renderer.ts`
- `packages/rendering/src/WebGL2Device.ts`
- `packages/rendering/src/WebGPUDevice.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/ShaderLibrary.ts`

## Current Areas

- WebGL2 is the broadly available default backend for most routes.
- WebGPU has explicit device, production-runtime, render-target, PBR asset, instancing, and compute-particle routes with device-dependent availability.
- Geometry, vertex/index buffers, textures, render targets, materials, shaders, render queues, and diagnostics.
- PBR, environment resources, shadows, postprocess, instancing, culling, stereo/effects, decals, and resource disposal.
- Route coverage across material, loader, shadow, postprocess, camera, controls, WebGPU, and parity apps.

## Boundary

Renderer docs must distinguish package capability, route evidence, generated report status, and public claims. A route screenshot does not prove broad renderer parity by itself.

## Current Limits

- Rendering support is bounded by documented APIs, route coverage, and generated reports; it is not a blanket parity claim for every renderer feature or hardware target.
- WebGPU support is conditional on `navigator.gpu`, adapter/device availability, and the rows in `tests/reports/webgpu-feature-matrix.json`.
- Hardware claims should follow [WebGPU hardware matrix](../rendering/webgpu-hardware-matrix.md) and fallback behavior should follow [WebGPU availability and fallback behavior](../rendering/webgpu-fallback.md).
