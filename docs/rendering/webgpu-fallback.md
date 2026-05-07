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

The current v2 status does not claim full real-hardware WebGPU support. Real public WebGPU claims still require a hardware matrix, browser/OS versions, adapter names, parity reports, performance comparisons, and fallback evidence.
