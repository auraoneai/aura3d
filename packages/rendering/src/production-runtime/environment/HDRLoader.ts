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

export { parseProductionRadianceHDR as parseRadianceHDR };
export type {
  ProductionEnvironmentLightingResources,
  ProductionPbrHdrPipeline,
  ProductionPbrHdrPipelineOptions,
  ProductionRadianceHDR as RadianceHDR
};
