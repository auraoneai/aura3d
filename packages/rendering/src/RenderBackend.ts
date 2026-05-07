import { type RenderBackendKind, type RenderDevice, MockRenderDevice, RenderDeviceError } from "./RenderDevice";
import { WebGL2Device, type WebGL2DeviceOptions } from "./WebGL2Device";
import { WebGPUDevice, type WebGPULike } from "./WebGPUDevice";

export interface RenderBackendOptions {
  readonly backend?: RenderBackendKind;
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  readonly antialias?: boolean;
  readonly alpha?: boolean;
  readonly preserveDrawingBuffer?: boolean;
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
    return WebGL2Device.create(webglOptions);
  }
  if (backend === "webgpu") {
    return WebGPUDevice.create({ gpu: options.webgpu, canvas: options.canvas });
  }
  throw new RenderDeviceError("Unknown render backend", "UNKNOWN_BACKEND", { backend });
}
