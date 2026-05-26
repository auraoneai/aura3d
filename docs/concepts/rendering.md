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

- WebGL2 and WebGPU-facing device implementations.
- Geometry, vertex/index buffers, textures, render targets, materials, shaders, render queues, and diagnostics.
- PBR, environment resources, shadows, postprocess, instancing, culling, stereo/effects, decals, and resource disposal.
- Route coverage across material, loader, shadow, postprocess, camera, controls, WebGPU, and parity apps.

## Boundary

Renderer docs must distinguish package capability, route evidence, generated report status, and public claims. A route screenshot does not prove broad renderer parity by itself.

## Current Limits

Rendering support is bounded by the implemented WebGL2/WebGPU device paths, route coverage, and generated reports. Broad claims about all materials, postprocess chains, browsers, GPUs, or Three.js parity need dedicated evidence.

## Current Limits

- Rendering support is bounded to documented APIs, routes, and reports; it is not a blanket parity claim for every renderer feature or hardware target.
