# WebGPU Fallback Behavior

Galileo3D treats WebGPU as an explicit backend request. It does not silently replace a failed WebGPU request with WebGL2, the mock backend, or CPU-only rendering.

## Unavailable Runtime

When browser code calls `createRenderDevice({ backend: "webgpu" })` and the page has no usable `navigator.gpu`, backend creation fails with `RenderDeviceError` code `WEBGPU_RUNTIME_MISSING`.

Application code should catch that error and choose its own fallback policy. A typical browser app can then request a WebGL2 renderer with a canvas:

```ts
import { createRenderDevice } from "@galileo3d/rendering";

async function createPreferredDevice(canvas: HTMLCanvasElement) {
  try {
    return await createRenderDevice({ backend: "webgpu", canvas });
  } catch (error) {
    if ((error as { code?: string }).code !== "WEBGPU_RUNTIME_MISSING") {
      throw error;
    }
    return createRenderDevice({ backend: "webgl2", canvas });
  }
}
```

The fallback is intentionally app-owned so product code can show user-facing copy, collect diagnostics, or disable WebGPU-only features before choosing WebGL2.

## Missing Adapter

If a browser exposes `navigator.gpu` but `requestAdapter()` returns `null`, backend creation fails with `RenderDeviceError` code `WEBGPU_ADAPTER_MISSING`.

Common causes include unsupported hardware, blocked GPU access, browser flags, enterprise policy, remote desktop sessions, or power-saving adapter selection. Apps should treat this as a capability failure, not as a successful WebGPU initialization.

## Failed Device Request

If an adapter exists but `requestDevice()` rejects, backend creation fails with `RenderDeviceError` code `WEBGPU_DEVICE_REQUEST_FAILED`. The error details include the adapter description and rejection reason when available.

## Unsupported Canvas Presentation

WebGPU device creation can succeed without canvas presentation. If a canvas is supplied but cannot provide a usable `webgpu` context, creation fails with either `WEBGPU_CANVAS_CONTEXT_MISSING` or `WEBGPU_CANVAS_CONTEXT_INVALID`.

## Current Repo Status

The current repo has WebGPU coverage in three forms:

- low-level `WebGPUDevice` and render-to-texture/readback tests;
- v6 WebGPU readiness and app-suite routes;
- v8 route evidence for WebGPU RTT, materials, instance-uniform submission, and compute particles.

The v8 route registry and visual review include WebGPU app surfaces, but those are still evidence routes. They are not a claim that the full renderer is better than Three.js WebGPU across browsers and GPUs.

## Claim Boundary

Allowed: "WebGPU is an explicit backend with bounded render-target, material, instancing, compute, fallback, and route evidence."

Not allowed: "full WebGPU support", "automatic WebGPU/WebGL2 parity", or "better than Three.js WebGPU" unless broader hardware, visual, feature, and performance reports exist for the specific claim.

Full public WebGPU claims still require broader production-renderer feature coverage, broader browser/OS/GPU coverage, performance comparisons, fallback evidence, and a passing broad-parity gate.
