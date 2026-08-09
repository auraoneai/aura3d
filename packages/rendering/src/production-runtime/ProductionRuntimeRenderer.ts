import { ProductionWebGL2Renderer, type ProductionWebGL2RendererOptions } from './ProductionWebGL2Renderer';
import type { ProductionWebGPURenderer } from './ProductionWebGPURenderer';
import type { RenderDeviceDiagnostics } from "../RenderDevice";
import { createDefaultShaderLibrary } from "../ShaderLibrary";
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

  /** WS-2.6 — delegate device-loss subscription to whichever backend was selected. */
  onDeviceLost(listener: () => void): () => void {
    return this.renderer.onDeviceLost?.(listener) ?? (() => undefined);
  }

  onDeviceRestored(listener: () => void): () => void {
    return this.renderer.onDeviceRestored?.(listener) ?? (() => undefined);
  }

  deviceLost(): boolean {
    return this.renderer.deviceLost?.() ?? false;
  }

  static async create(options: ProductionRuntimeRendererOptions): Promise<ProductionRuntimeRenderer> {
    const selection = resolveProductionRuntimeRendererBackend(options);
    if (selection.selectedBackend === "webgpu") {
      // Dynamically imported so the WebGPU backend can be emitted as its own chunk: a
      // WebGL2-only app should not download a backend it will never construct. Measured with
      // esbuild `splitting: true` on this module, the backend and its device/shader graph move
      // into separate chunks totalling ~85 KB unminified-gzip.
      //
      // Note this is not visible in `pnpm check:bundle-size`, whose harness does not enable
      // splitting and so re-inlines the import; that report shows a ~5 KB *increase* from the
      // added async plumbing. The win is real only for a splitting-capable consumer bundler.
      // Kept because the static `import` also forced `instanceof` checks below to retain the
      // class at runtime, which defeated the split unconditionally.
      try {
        const { ProductionWebGPURenderer } = await import("./ProductionWebGPURenderer.js");
        return new ProductionRuntimeRenderer(await ProductionWebGPURenderer.create(options), "webgpu", selection);
      } catch (error) {
        if (selection.requestedBackend !== "auto") {
          throw new Error(
            `Explicit WebGPU renderer initialization failed and will not silently use WebGL2: ${rendererInitializationError(error)}`,
            { cause: error }
          );
        }
        return ProductionRuntimeRenderer.createWebGL2(options, {
          requestedBackend: "auto",
          selectedBackend: "webgl2",
          asyncRequired: false,
          fallback: true,
          reason: `backend='auto' attempted WebGPU, initialization failed, and WebGL2 was selected: ${rendererInitializationError(error)}`
        });
      }
    }
    return ProductionRuntimeRenderer.createWebGL2(options, selection);
  }

  private static async createWebGL2(
    options: ProductionRuntimeRendererOptions,
    selection: ProductionRuntimeRendererBackendSelection
  ): Promise<ProductionRuntimeRenderer> {
    const { backend: _backend, ...webgl2Options } = options;
    return new ProductionRuntimeRenderer(
      await ProductionWebGL2Renderer.create({
        ...webgl2Options,
        shaderLibrary: webgl2Options.shaderLibrary ?? createDefaultShaderLibrary()
      }),
      "webgl2",
      selection
    );
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
    const result = this.backend === "webgpu"
      ? await (this.renderer as ProductionWebGPURenderer).renderFrameAsync(input)
      : this.renderInteractiveFrame(input);
    return withoutReadbackFeatures(result);
  }

  async renderFrameAsync(input: ProductionRendererInput): Promise<RuntimeParityFrameRenderResult> {
    return this.renderInteractiveFrameAsync(input);
  }

  async captureProofAsync(input: ProductionRendererInput): Promise<ProductionRenderProof> {
    if (this.backend === "webgpu") {
      return (this.renderer as ProductionWebGPURenderer).renderImportedAssetAsync(input);
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

function rendererInitializationError(error: unknown): string {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? ` [${error.code}]` : "";
    return `${error.name}${code}: ${error.message}`;
  }
  return String(error);
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
