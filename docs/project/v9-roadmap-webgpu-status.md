# V9 WebGPU Status

WebGPU is scoped and partial.

## Real Code

- `packages/rendering/src/WebGPUDevice.ts`
- `packages/rendering/src/v6/ProductionWebGPURenderer.ts`
- `packages/rendering/src/v6/backends/webgpu/*`
- `packages/rendering/src/v6/shaders/wgsl/*`
- `apps/v8-webgpu-rtt/`
- `apps/v8-webgpu-compute/`
- `apps/v8-webgpu-materials/`
- `apps/v8-webgpu-instance-uniform/`

## Current Claim

G3D has WebGPU-facing code and demo routes for RTT, compute, materials, and instance uniforms.

## Blocked Claims

- Full Three.js WebGPU parity.
- Browser/GPU-wide production readiness.
- Performance superiority.
- Complete material parity on WebGPU.

## Required To Graduate

- Real `navigator.gpu` hardware evidence across supported browsers/devices.
- Same-scene visual comparison against matching Three.js WebGPU examples.
- WebGPU-specific lifecycle/readback/presentation evidence.
- Clear fallback behavior for unsupported browser/GPU combinations.
