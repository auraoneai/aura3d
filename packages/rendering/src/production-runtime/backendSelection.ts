/**
 * PRD-15 T2.6 — backend-selection types and `resolveProductionRuntimeRendererBackend`
 * moved verbatim out of `ProductionRuntimeRenderer.ts` before that wrapper file
 * was deleted (0 changed logic lines). Consumers keep importing the same names
 * through the `production-runtime` barrel.
 */
import type { RendererOptions } from "../Renderer";
import type { ProductionRendererBackend } from "./ProductionRendererTypes";

export interface ProductionWebGL2RendererOptions extends Omit<RendererOptions, "backend"> {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly width: number;
  readonly height: number;
}

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
