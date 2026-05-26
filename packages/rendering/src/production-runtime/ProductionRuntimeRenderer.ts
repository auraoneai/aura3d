import { ProductionWebGL2Renderer, type ProductionWebGL2RendererOptions } from './ProductionWebGL2Renderer';
import { ProductionWebGPURenderer } from './ProductionWebGPURenderer';
import type { RenderDeviceDiagnostics } from "../RenderDevice";
import type {
  ProductionRendererBackend,
  ProductionProductionRenderer,
  ProductionRenderProof,
  ProductionRendererFeature,
  ProductionRendererInput,
  CurrentRoutesProductionRenderer,
  RuntimeParityFrameRenderResult
} from './ProductionRendererTypes';

export interface ProductionRuntimeRendererOptions extends ProductionWebGL2RendererOptions {
  readonly backend?: ProductionRuntimeRendererBackendPreference;
}

export type ProductionRuntimeRendererBackendPreference = "webgl2" | "webgpu" | "auto";

export interface ProductionRuntimeRendererBackendSelection {
  readonly requestedBackend: ProductionRuntimeRendererBackendPreference;
  readonly selectedBackend: ProductionRendererBackend;
  readonly asyncRequired: boolean;
  readonly fallback: boolean;
  readonly reason: string;
}

type ProductionRuntimeRendererWebGPURuntime = NonNullable<ProductionRuntimeRendererOptions["webgpu"]>;

export class ProductionRuntimeRenderer implements CurrentRoutesProductionRenderer {
  readonly backend: ProductionRendererBackend;
  readonly backendSelection: ProductionRuntimeRendererBackendSelection;

  private constructor(
    private readonly renderer: ProductionProductionRenderer,
    backend: ProductionRendererBackend,
    backendSelection: ProductionRuntimeRendererBackendSelection
  ) {
    this.backend = backend;
    this.backendSelection = backendSelection;
  }

  static async create(options: ProductionRuntimeRendererOptions): Promise<ProductionRuntimeRenderer> {
    const selection = resolveProductionRuntimeRendererBackend(options);
    if (selection.selectedBackend === "webgpu") {
      return new ProductionRuntimeRenderer(await ProductionWebGPURenderer.create(options), "webgpu", selection);
    }
    const { backend: _backend, ...webgl2Options } = options;
    return new ProductionRuntimeRenderer(await ProductionWebGL2Renderer.create(webgl2Options), "webgl2", selection);
  }

  renderInteractiveFrame(input: ProductionRendererInput): RuntimeParityFrameRenderResult {
    const renderer = this.renderer as ProductionProductionRenderer & Partial<CurrentRoutesProductionRenderer>;
    const result = renderer.renderInteractiveFrame ? renderer.renderInteractiveFrame(input) : renderer.renderFrame(input);
    return withoutReadbackFeatures(result);
  }

  renderFrame(input: ProductionRendererInput): RuntimeParityFrameRenderResult {
    return this.renderInteractiveFrame(input);
  }

  resize(width: number, height: number): void {
    const renderer = this.renderer as ProductionProductionRenderer & { resize?: (width: number, height: number) => void };
    if (typeof renderer.resize !== "function") {
      throw new Error(`Renderer backend ${this.backend} does not support interactive resizing.`);
    }
    renderer.resize(width, height);
  }

  captureProof(input: ProductionRendererInput): ProductionRenderProof {
    const renderer = this.renderer as ProductionProductionRenderer & Partial<CurrentRoutesProductionRenderer>;
    return renderer.captureProof ? renderer.captureProof(input) : renderer.renderImportedAsset(input);
  }

  renderImportedAsset(input: ProductionRendererInput): ProductionRenderProof {
    return this.captureProof(input);
  }

  async renderInteractiveFrameAsync(input: ProductionRendererInput): Promise<RuntimeParityFrameRenderResult> {
    const result = this.renderer instanceof ProductionWebGPURenderer
      ? await this.renderer.renderFrameAsync(input)
      : this.renderInteractiveFrame(input);
    return withoutReadbackFeatures(result);
  }

  async renderFrameAsync(input: ProductionRendererInput): Promise<RuntimeParityFrameRenderResult> {
    return this.renderInteractiveFrameAsync(input);
  }

  async captureProofAsync(input: ProductionRendererInput): Promise<ProductionRenderProof> {
    if (this.renderer instanceof ProductionWebGPURenderer) {
      return this.renderer.renderImportedAssetAsync(input);
    }
    return this.captureProof(input);
  }

  async renderImportedAssetAsync(input: ProductionRendererInput): Promise<ProductionRenderProof> {
    return this.captureProofAsync(input);
  }

  getFeatures(): readonly ProductionRendererFeature[] {
    return this.renderer.getFeatures();
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    return this.renderer.getDiagnostics();
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

export function createProductionRuntimeRenderer(options: ProductionRuntimeRendererOptions): Promise<ProductionRuntimeRenderer> {
  return ProductionRuntimeRenderer.create(options);
}

export function resolveProductionRuntimeRendererBackend(options: Pick<ProductionRuntimeRendererOptions, "backend" | "webgpu">): ProductionRuntimeRendererBackendSelection {
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

function readBrowserWebGPU(): ProductionRuntimeRendererWebGPURuntime | undefined {
  const navigatorWithGpu = (globalThis as typeof globalThis & {
    readonly navigator?: Navigator & { readonly gpu?: ProductionRuntimeRendererWebGPURuntime };
  }).navigator;
  return navigatorWithGpu?.gpu;
}

function withoutReadbackFeatures(result: RuntimeParityFrameRenderResult): RuntimeParityFrameRenderResult {
  return {
    ...result,
    features: result.features.filter((feature) => feature.id !== "pixel-readback" && feature.id !== "scene-color-transmission-capture")
  };
}
