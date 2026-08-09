# WebGPU Availability And Fallback Behavior

Version: next major candidate

Aura3D has WebGPU package implementation, production-runtime, template, proof-test, and bounded root route surfaces. Browser/device availability remains conditional, so a named WebGPU route must either prove `a3d-webgpu` or show a structured unsupported state. The route, feature, and report inventory lives in [WebGPU route and report evidence](webgpu-route-and-report-evidence.md).

## Current Code

- `packages/rendering/src/WebGPUDevice.ts`
- `packages/rendering/src/WebGPURenderToTextureProof.ts`
- `packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts`
- `packages/rendering/src/effects/GPUParticleBackend.ts`
- `templates/production-webgpu-starter/`
- `apps/wow-webgpu-triangle/`
- `apps/wow-webgpu-render-target/`
- `apps/wow-webgpu-pbr-asset/`
- `apps/wow-webgpu-product-viewer/`
- `apps/wow-webgpu-instancing/`
- `apps/wow-webgpu-compute-particles/`

## Current Behavior

- WebGPU helpers probe `navigator.gpu` when browser support exists.
- `backend: "auto"` prefers WebGPU and falls back to WebGL2 when WebGPU
  initialization is unavailable. Diagnostics retain the native cause/code.
- Explicit `backend: "webgpu"` never silently substitutes WebGL2; failure is an
  actionable error.
- Expected diagnostic codes include `WEBGPU_RUNTIME_MISSING`, `WEBGPU_ADAPTER_MISSING`, `WEBGPU_DEVICE_REQUEST_FAILED`, `WEBGPU_CANVAS_CONTEXT_MISSING`, and `WEBGPU_CANVAS_CONTEXT_INVALID`.
- Explicit WebGPU routes use `backend: "webgpu"` and must not silently fall back to WebGL2.
- Auto-selection routes may use `backend: "auto"` only when the selected backend and reason are published in diagnostics.
- Root WebGPU routes publish `status: "ready"` or `status: "running"` when WebGPU is active, and `status: "unsupported"` with an `unsupportedReason` when WebGPU is unavailable.
- WebGL2 remains the primary broadly available route backend in this repository.

## Usage

Explicit WebGPU:

```ts
const renderer = await Renderer.create({ backend: "webgpu", canvas });
await renderer.renderAsync(scene);
```

Automatic backend selection through the production runtime:

```ts
const renderer = await ProductionRuntimeRenderer.create({
  backend: "auto",
  canvas,
  width: 1280,
  height: 720
});

console.log(renderer.backendSelection.selectedBackend, renderer.backendSelection.reason);
```

Use `renderAsync()` for WebGPU paths that need asynchronous submission/readback behavior. Keep synchronous `render()` usage scoped to paths that are proven to work without readback.

## Verification

Useful focused checks:

```sh
pnpm exec vitest run tests/unit/rendering/webgpu-render-to-texture-proof.test.ts tests/unit/rendering/production-runtime-webgpu-renderer.test.ts
pnpm exec playwright test tests/browser/production-runtime-webgpu-capability.spec.ts tests/browser/rendering-webgpu.spec.ts
pnpm renderer:webgpu-architecture
pnpm webgpu:route-health
pnpm webgpu
```

## Boundaries

The current architecture gate does retain real-hardware adapter/device, native
pipeline, upload, pass, readback, compute, fallback, error, and six-route
evidence on Chromium/Apple Metal. It does not claim universal browser
availability, root-default WebGPU, TSL parity, or WebGPU parity for every
renderer feature. See `webgpu-current-architecture.md`.
