import { type RenderBackendKind, type RenderDevice, MockRenderDevice, RenderDeviceError } from "./RenderDevice";
import { WebGL2Device, type WebGL2DeviceOptions, type WebGL2ErrorCheckMode } from "./WebGL2Device";
// Type-only import: the WebGPU implementation is loaded on demand below so a route that renders
// on WebGL2 does not ship the WebGPU device at all. `import type` is erased at build time.
import type { WebGPULike } from "./WebGPUDevice";

export interface RenderBackendOptions {
  readonly backend?: RenderBackendKind;
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  readonly antialias?: boolean;
  readonly alpha?: boolean;
  readonly preserveDrawingBuffer?: boolean;
  readonly errorCheckMode?: WebGL2ErrorCheckMode;
  readonly webgpu?: WebGPULike;
}

export async function createRenderDevice(options: RenderBackendOptions = {}): Promise<RenderDevice> {
  const backend = options.backend ?? "webgl2";
  if (backend === "mock") {
    return new MockRenderDevice();
  }
  if (backend === "webgl2") {
    if (!options.canvas) {
      throw new RenderDeviceError("WebGL2 backend requires a canvas", "MISSING_CANVAS");
    }
    const webglOptions: WebGL2DeviceOptions = { canvas: options.canvas };
    if (options.antialias !== undefined) {
      Object.assign(webglOptions, { antialias: options.antialias });
    }
    if (options.alpha !== undefined) {
      Object.assign(webglOptions, { alpha: options.alpha });
    }
    if (options.preserveDrawingBuffer !== undefined) {
      Object.assign(webglOptions, { preserveDrawingBuffer: options.preserveDrawingBuffer });
    }
    if (options.errorCheckMode !== undefined) {
      Object.assign(webglOptions, { errorCheckMode: options.errorCheckMode });
    }
    return WebGL2Device.create(webglOptions);
  }
  if (backend === "webgpu") {
    // Dynamically imported so the WebGPU device is a separate chunk. `WebGPUDevice.ts` is ~139 KB
    // of source, and a statically imported branch is retained by bundlers even when the caller
    // only ever asks for `webgl2` — which is what put the Aura Clash route 309 KB over its JS
    // budget. Callers that genuinely select WebGPU already await this function.
    const { WebGPUDevice } = await import("./WebGPUDevice");
    return WebGPUDevice.create({ gpu: options.webgpu, canvas: options.canvas });
  }
  throw new RenderDeviceError("Unknown render backend", "UNKNOWN_BACKEND", { backend });
}
