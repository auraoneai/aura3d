import type { EnvironmentLightingOptions } from "../../ForwardPass";
import {
  createV6EnvironmentLightingResources,
  createV6PbrHdrPipelineFromRadiance,
  parseV6RadianceHDR,
  type V6EnvironmentLightingResources,
  type V6PbrHdrPipeline,
  type V6PbrHdrPipelineOptions,
  type V6RadianceHDR
} from "../PBRHDRPipeline";

export interface V6HdrEnvironmentLoaderOptions extends Omit<V6PbrHdrPipelineOptions, "id" | "label"> {
  readonly id?: string;
  readonly label?: string;
}

export interface V6LoadedHdrEnvironment {
  readonly id: string;
  readonly label: string;
  readonly radiance: V6RadianceHDR;
  readonly pipeline: V6PbrHdrPipeline;
  readonly lighting: EnvironmentLightingOptions;
  readonly resources: V6EnvironmentLightingResources;
  dispose(): void;
}

export function loadV6HdrEnvironment(
  buffer: ArrayBuffer | Uint8Array,
  options: V6HdrEnvironmentLoaderOptions = {}
): V6LoadedHdrEnvironment {
  const id = options.id ?? "production-runtime-radiance-hdr-environment";
  const label = options.label ?? id;
  const pipeline = createV6PbrHdrPipelineFromRadiance(buffer, {
    ...options,
    id,
    label
  });
  const resources = createV6EnvironmentLightingResources(pipeline);

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

export { parseV6RadianceHDR as parseRadianceHDR };
export type {
  V6EnvironmentLightingResources,
  V6PbrHdrPipeline,
  V6PbrHdrPipelineOptions,
  V6RadianceHDR as RadianceHDR
};
