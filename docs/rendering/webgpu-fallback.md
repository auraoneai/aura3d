# WebGPU Fallback Behavior

Version: `1.0.0`

Aura3D has WebGPU device code and WebGPU app routes, but browser/device availability remains conditional.

## Current Code

- `packages/rendering/src/WebGPUDevice.ts`
- `packages/rendering/src/WebGPURenderToTextureProof.ts`
- `apps/webgpu-rtt/`
- `apps/webgpu-compute/`
- `apps/webgpu-materials/`
- `apps/webgpu-instance-uniform/`
- `apps/webgpu-lab/`

## Current Behavior

- WebGPU helpers probe `navigator.gpu` when browser support exists.
- Aura3D does not silently replace a failed WebGPU request with a success claim; the failure must surface as an explicit diagnostic.
- Expected diagnostic codes include `WEBGPU_RUNTIME_MISSING`, `WEBGPU_ADAPTER_MISSING`, `WEBGPU_DEVICE_REQUEST_FAILED`, `WEBGPU_CANVAS_CONTEXT_MISSING`, and `WEBGPU_CANVAS_CONTEXT_INVALID`.
- Routes should publish explicit unavailable/unsupported diagnostics instead of pretending hardware support.
- WebGL2 remains the primary broadly available route backend in this repository.

## Verification

Useful focused checks:

```sh
pnpm exec vitest run tests/unit/rendering/webgpu-render-to-texture-proof.test.ts tests/unit/rendering/production-runtime-webgpu-renderer.test.ts
pnpm exec playwright test tests/browser/production-runtime-webgpu-capability.spec.ts tests/browser/rendering-webgpu.spec.ts
```

## Boundaries

Do not document full WebGPU parity across browsers and GPUs. The current supported claim is route and device-probe evidence for named WebGPU workflows.

This does not claim full real-hardware WebGPU support.
