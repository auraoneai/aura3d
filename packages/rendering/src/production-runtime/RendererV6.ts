import { ProductionWebGL2Renderer, type ProductionWebGL2RendererOptions } from './ProductionWebGL2Renderer';
import { ProductionWebGPURenderer } from './ProductionWebGPURenderer';
import type { RenderDeviceDiagnostics } from "../RenderDevice";
import type {
  V6RendererBackend,
  V6ProductionRenderer,
  V6RenderProof,
  V6RendererFeature,
  V6RendererInput,
  V8ProductionRenderer,
  V7FrameRenderResult
} from './ProductionRendererTypes';

export interface RendererV6Options extends ProductionWebGL2RendererOptions {
  readonly backend?: RendererV6BackendPreference;
}

export type RendererV6BackendPreference = "webgl2" | "webgpu" | "auto";

export interface RendererV6BackendSelection {
  readonly requestedBackend: RendererV6BackendPreference;
  readonly selectedBackend: V6RendererBackend;
  readonly asyncRequired: boolean;
  readonly fallback: boolean;
  readonly reason: string;
}

type RendererV6WebGPURuntime = NonNullable<RendererV6Options["webgpu"]>;

export class RendererV6 implements V8ProductionRenderer {
  readonly backend: V6RendererBackend;
  readonly backendSelection: RendererV6BackendSelection;

  private constructor(
    private readonly renderer: V6ProductionRenderer,
    backend: V6RendererBackend,
    backendSelection: RendererV6BackendSelection
  ) {
    this.backend = backend;
    this.backendSelection = backendSelection;
  }

  static async create(options: RendererV6Options): Promise<RendererV6> {
    const selection = resolveRendererV6Backend(options);
    if (selection.selectedBackend === "webgpu") {
      return new RendererV6(await ProductionWebGPURenderer.create(options), "webgpu", selection);
    }
    const { backend: _backend, ...webgl2Options } = options;
    return new RendererV6(await ProductionWebGL2Renderer.create(webgl2Options), "webgl2", selection);
  }

  renderInteractiveFrame(input: V6RendererInput): V7FrameRenderResult {
    const renderer = this.renderer as V6ProductionRenderer & Partial<V8ProductionRenderer>;
    const result = renderer.renderInteractiveFrame ? renderer.renderInteractiveFrame(input) : renderer.renderFrame(input);
    return withoutReadbackFeatures(result);
  }

  renderFrame(input: V6RendererInput): V7FrameRenderResult {
    return this.renderInteractiveFrame(input);
  }

  resize(width: number, height: number): void {
    const renderer = this.renderer as V6ProductionRenderer & { resize?: (width: number, height: number) => void };
    if (typeof renderer.resize !== "function") {
      throw new Error(`Renderer backend ${this.backend} does not support interactive resizing.`);
    }
    renderer.resize(width, height);
  }

  captureProof(input: V6RendererInput): V6RenderProof {
    const renderer = this.renderer as V6ProductionRenderer & Partial<V8ProductionRenderer>;
    return renderer.captureProof ? renderer.captureProof(input) : renderer.renderImportedAsset(input);
  }

  renderImportedAsset(input: V6RendererInput): V6RenderProof {
    return this.captureProof(input);
  }

  async renderInteractiveFrameAsync(input: V6RendererInput): Promise<V7FrameRenderResult> {
    const result = this.renderer instanceof ProductionWebGPURenderer
      ? await this.renderer.renderFrameAsync(input)
      : this.renderInteractiveFrame(input);
    return withoutReadbackFeatures(result);
  }

  async renderFrameAsync(input: V6RendererInput): Promise<V7FrameRenderResult> {
    return this.renderInteractiveFrameAsync(input);
  }

  async captureProofAsync(input: V6RendererInput): Promise<V6RenderProof> {
    if (this.renderer instanceof ProductionWebGPURenderer) {
      return this.renderer.renderImportedAssetAsync(input);
    }
    return this.captureProof(input);
  }

  async renderImportedAssetAsync(input: V6RendererInput): Promise<V6RenderProof> {
    return this.captureProofAsync(input);
  }

  getFeatures(): readonly V6RendererFeature[] {
    return this.renderer.getFeatures();
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    return this.renderer.getDiagnostics();
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

export function createRendererV6(options: RendererV6Options): Promise<RendererV6> {
  return RendererV6.create(options);
}

export function resolveRendererV6Backend(options: Pick<RendererV6Options, "backend" | "webgpu">): RendererV6BackendSelection {
  const browserWebGPU = readBrowserWebGPU();
  const hasWebGPU = Boolean(options.webgpu ?? browserWebGPU);
  const requestedBackend = options.backend ?? (hasWebGPU ? "auto" : "webgl2");
  if (requestedBackend === "webgpu") {
    return {
      requestedBackend,
      selectedBackend: "webgpu",
      asyncRequired: true,
      fallback: false,
      reason: "Explicit backend='webgpu' uses ProductionWebGPURenderer and fails if native WebGPU capabilities are missing."
    };
  }
  if (requestedBackend === "auto") {
    if (hasWebGPU) {
      return {
        requestedBackend,
        selectedBackend: "webgpu",
        asyncRequired: true,
        fallback: false,
        reason: options.webgpu
          ? "backend='auto' selected WebGPU because a WebGPU runtime object was provided."
          : "backend='auto' selected WebGPU because navigator.gpu is available in the current browser runtime."
      };
    }
    return {
      requestedBackend,
      selectedBackend: "webgl2",
      asyncRequired: false,
      fallback: true,
      reason: "backend='auto' selected WebGL2 because no WebGPU runtime object was provided to the SDK."
    };
  }
  return {
    requestedBackend,
    selectedBackend: "webgl2",
    asyncRequired: false,
    fallback: false,
    reason: "WebGL2 is selected when no WebGPU runtime is supplied, or when the app explicitly requests backend='webgl2'."
  };
}

function readBrowserWebGPU(): RendererV6WebGPURuntime | undefined {
  const navigatorWithGpu = (globalThis as typeof globalThis & {
    readonly navigator?: Navigator & { readonly gpu?: RendererV6WebGPURuntime };
  }).navigator;
  return navigatorWithGpu?.gpu;
}

function withoutReadbackFeatures(result: V7FrameRenderResult): V7FrameRenderResult {
  return {
    ...result,
    features: result.features.filter((feature) => feature.id !== "pixel-readback" && feature.id !== "scene-color-transmission-capture")
  };
}
