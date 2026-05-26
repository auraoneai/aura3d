import { createShadowAtlasLayout, createShadowFilterKernel, type ShadowAtlasLayout, type ShadowFilterKernel } from "../ShadowMap";

export interface ExternalParityCascadeDescriptor {
  readonly index: number;
  readonly near: number;
  readonly far: number;
  readonly mapSize: number;
}

export interface ExternalParityCascadedShadowPipeline {
  readonly cascades: readonly ExternalParityCascadeDescriptor[];
  readonly atlas: ShadowAtlasLayout;
  readonly filter: ShadowFilterKernel;
  readonly bias: number;
  readonly stableTexelSnapping: true;
  readonly diagnostic: string;
}

export function createExternalParityCascadedShadowPipeline(options: {
  readonly cameraNear?: number;
  readonly cameraFar?: number;
  readonly cascadeCount?: number;
  readonly mapSize?: number;
  readonly atlasSize?: number;
  readonly bias?: number;
  readonly pcfRadius?: number;
} = {}): ExternalParityCascadedShadowPipeline {
  const cameraNear = options.cameraNear ?? 0.1;
  const cameraFar = options.cameraFar ?? 80;
  const cascadeCount = options.cascadeCount ?? 4;
  const mapSize = options.mapSize ?? 512;
  const atlasSize = options.atlasSize ?? 1024;
  if (!Number.isFinite(cameraNear) || !Number.isFinite(cameraFar) || cameraNear <= 0 || cameraFar <= cameraNear) throw new RangeError("Invalid cascaded shadow camera range.");
  if (!Number.isInteger(cascadeCount) || cascadeCount < 2 || cascadeCount > 4) throw new RangeError("ExternalParity cascadeCount must be 2-4.");
  const cascades = Array.from({ length: cascadeCount }, (_, index) => {
    const start = index / cascadeCount;
    const end = (index + 1) / cascadeCount;
    return {
      index,
      near: Number((cameraNear + (cameraFar - cameraNear) * start * start).toFixed(4)),
      far: Number((cameraNear + (cameraFar - cameraNear) * end * end).toFixed(4)),
      mapSize
    };
  });
  return {
    cascades,
    atlas: createShadowAtlasLayout(cascades.map((cascade) => ({ id: `cascade-${cascade.index}`, size: cascade.mapSize, cascadeIndex: cascade.index })), atlasSize),
    filter: createShadowFilterKernel({ filter: "pcf", pcfRadius: options.pcfRadius ?? 1.5, pcfSamples: 9, pcfDistribution: "grid" }),
    bias: options.bias ?? 0.0015,
    stableTexelSnapping: true,
    diagnostic: "Cascaded shadow pipeline for larger scenes; shadow acne and peter-panning still require visual gates."
  };
}
