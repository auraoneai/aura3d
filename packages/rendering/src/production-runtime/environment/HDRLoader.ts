import type { EnvironmentLightingOptions } from "../../ForwardPass";
import {
  createProductionEnvironmentLightingResources,
  createProductionPbrHdrPipelineFromRadiance,
  parseProductionRadianceHDR,
  type ProductionEnvironmentLightingResources,
  type ProductionPbrHdrPipeline,
  type ProductionPbrHdrPipelineOptions,
  type ProductionRadianceHDR
} from "../PBRHDRPipeline";

export interface ProductionHdrEnvironmentLoaderOptions extends Omit<ProductionPbrHdrPipelineOptions, "id" | "label"> {
  readonly id?: string;
  readonly label?: string;
}

export type ProductionHdrEnvironmentFileSource = string | URL | Blob;

export interface ProductionHdrEnvironmentFileLoaderOptions extends ProductionHdrEnvironmentLoaderOptions {
  readonly fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  readonly requestInit?: RequestInit;
}

export interface ProductionLoadedHdrEnvironment {
  readonly id: string;
  readonly label: string;
  readonly radiance: ProductionRadianceHDR;
  readonly pipeline: ProductionPbrHdrPipeline;
  readonly lighting: EnvironmentLightingOptions;
  readonly resources: ProductionEnvironmentLightingResources;
  dispose(): void;
}

export function loadProductionHdrEnvironment(
  buffer: ArrayBuffer | Uint8Array,
  options: ProductionHdrEnvironmentLoaderOptions = {}
): ProductionLoadedHdrEnvironment {
  const id = options.id ?? "production-runtime-radiance-hdr-environment";
  const label = options.label ?? id;
  const pipeline = createProductionPbrHdrPipelineFromRadiance(buffer, {
    ...options,
    id,
    label
  });
  const resources = createProductionEnvironmentLightingResources(pipeline);

  return {
    id: pipeline.id,
    label: pipeline.label,
    radiance: pipeline.radiance,
    pipeline,
    lighting: resources.lighting,
    resources,
    dispose: () => resources.dispose()
  };
}

export async function loadProductionHdrEnvironmentFile(
  source: ProductionHdrEnvironmentFileSource,
  options: ProductionHdrEnvironmentFileLoaderOptions = {}
): Promise<ProductionLoadedHdrEnvironment> {
  const { fetcher, requestInit, ...environmentOptions } = options;
  let bytes: ArrayBuffer;
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    bytes = await source.arrayBuffer();
  } else {
    const fetchImplementation = fetcher ?? globalThis.fetch;
    if (typeof fetchImplementation !== "function") {
      throw new Error("Production HDR file loading requires fetch or an explicit fetcher.");
    }
    const response = await fetchImplementation(source as string | URL, requestInit);
    if (!response.ok) {
      throw new Error(`Production HDR file request failed with HTTP ${response.status} ${response.statusText}`.trim());
    }
    bytes = await response.arrayBuffer();
  }
  return loadProductionHdrEnvironment(bytes, environmentOptions);
}

export { parseProductionRadianceHDR as parseRadianceHDR };
export type {
  ProductionEnvironmentLightingResources,
  ProductionPbrHdrPipeline,
  ProductionPbrHdrPipelineOptions,
  ProductionRadianceHDR as RadianceHDR
};
