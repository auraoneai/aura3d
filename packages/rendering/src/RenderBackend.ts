import { type RenderBackendKind, type RenderDevice, MockRenderDevice, RenderDeviceError } from "./RenderDevice";
import { WebGL2Device, type WebGL2DeviceOptions, type WebGL2ErrorCheckMode } from "./WebGL2Device";
// Type-only import: the WebGPU implementation is loaded on demand below so a route that renders
// on WebGL2 does not ship the WebGPU device at all. `import type` is erased at build time.
import type { WebGPULike } from "./WebGPUDevice";
import type { TextureBudgetPolicy } from "./textures/TextureBudget";

export interface RenderBackendOptions {
  readonly backend?: RenderBackendKind;
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  readonly antialias?: boolean;
  readonly alpha?: boolean;
  /** Presentation association chosen before a canvas context is acquired. */
  readonly presentationAlphaMode?: "opaque" | "straight" | "premultiplied";
  readonly preserveDrawingBuffer?: boolean;
  /** §6.9 (lane 01): forwarded to getContext; absent = browser default. */
  readonly powerPreference?: WebGLPowerPreference;
  readonly errorCheckMode?: WebGL2ErrorCheckMode;
  /** Opt-in sampled-texture admission limits; omitted means no admission limit. */
  readonly textureBudgetPolicy?: TextureBudgetPolicy;
  readonly webgpu?: WebGPULike;
  /** Native adapter features, distinct from RendererOptions.requiredFeatures. */
  readonly webgpuRequiredFeatures?: readonly string[];
  readonly webgpuRequiredLimits?: Readonly<Record<string, number>>;
  /** Require usable native rendering rather than a validation-only device. */
  readonly requireNativeRendering?: boolean;
  /** Opt into managed WebGPU ownership; legacy callers cannot supersede a managed canvas. */
  readonly webgpuCanvasOwnership?: "exclusive" | "legacy";
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
    if (options.presentationAlphaMode !== undefined) {
      Object.assign(webglOptions, { presentationAlphaMode: options.presentationAlphaMode });
    }
    if (options.preserveDrawingBuffer !== undefined) {
      Object.assign(webglOptions, { preserveDrawingBuffer: options.preserveDrawingBuffer });
    }
    if (options.powerPreference !== undefined) {
      Object.assign(webglOptions, { powerPreference: options.powerPreference });
    }
    if (options.errorCheckMode !== undefined) {
      Object.assign(webglOptions, { errorCheckMode: options.errorCheckMode });
    }
    if (options.textureBudgetPolicy !== undefined) {
      Object.assign(webglOptions, { textureBudgetPolicy: options.textureBudgetPolicy });
    }
    return WebGL2Device.create(webglOptions);
  }
  if (backend === "webgpu") {
    // Dynamically imported so the WebGPU device is a separate chunk. `WebGPUDevice.ts` is ~139 KB
    // of source, and a statically imported branch is retained by bundlers even when the caller
    // only ever asks for `webgl2` — which is what put the Aura Clash route 309 KB over its JS
    // budget. Callers that genuinely select WebGPU already await this function.
    const { WebGPUDevice } = await import("./WebGPUDevice");
    return WebGPUDevice.create({
      gpu: options.webgpu,
      canvas: options.canvas,
      presentationAlphaMode: options.presentationAlphaMode,
      requiredFeatures: options.webgpuRequiredFeatures,
      requiredLimits: options.webgpuRequiredLimits,
      requireNativeRendering: options.requireNativeRendering,
      canvasOwnership: options.webgpuCanvasOwnership,
      textureBudgetPolicy: options.textureBudgetPolicy
    });
  }
  throw new RenderDeviceError("Unknown render backend", "UNKNOWN_BACKEND", { backend });
}

/**
 * Canvas-context lookup for engine callers that must reach a canvas context the
 * device already owns (WebGPU swapchain handoff between renderers, WebGL2
 * capability probes for a device without a `gl` handle). It lives in this
 * device owner file so callers never call `getContext` themselves
 * (single-renderer gate), and is hung on `createRenderDevice` under a
 * registered symbol so the public export surface does not change.
 * Returns null when the canvas has no `getContext` or the lookup throws.
 */
function lookupCanvasContext(canvas: HTMLCanvasElement | OffscreenCanvas | undefined, kind: "webgl2" | "webgpu"): unknown {
  if (!canvas || typeof (canvas as { getContext?: unknown }).getContext !== "function") return null;
  try {
    // If a WebGL2 lookup creates the context before the device does, it must
    // not lock the canvas into the browser's default stencil:false configuration.
    return kind === "webgl2"
      ? (canvas as HTMLCanvasElement).getContext("webgl2", { stencil: true })
      : (canvas as HTMLCanvasElement).getContext("webgpu");
  } catch {
    return null;
  }
}

Object.defineProperty(createRenderDevice, Symbol.for("@aura3d/rendering/canvas-context-lookup/v1"), { value: lookupCanvasContext, configurable: true });
