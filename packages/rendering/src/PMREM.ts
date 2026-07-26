import {
  generateSpecularPrefilterMipLevels,
  specularPrefilterLevelRoughness,
  type Rgba8EnvironmentMapSource
} from "./EnvironmentMapResources";
import type { TextureMipLevelDescriptor } from "./Texture";

export interface ExternalParityPmremLevel {
  readonly level: number;
  readonly width: number;
  readonly height: number;
  readonly roughness: number;
  readonly byteLength: number;
}

export interface ExternalParityPmrem {
  readonly textureLabel: string;
  readonly mipLevels: readonly TextureMipLevelDescriptor[];
  readonly levels: readonly ExternalParityPmremLevel[];
  readonly diagnostics: {
    readonly mipCount: number;
    readonly maxRoughness: number;
    readonly totalByteLength: number;
    readonly directionalReflectionReady: boolean;
    readonly filterModel: "ggx-importance-sampled-equirect-prefilter";
    readonly sampleCount: number;
  };
}

/**
 * Builds a PMREM-style specular chain using real GGX importance-sampled
 * prefiltering. Each level's reported roughness is the roughness that level's
 * texels were actually convolved for, taken from the same schedule the filter
 * used — not derived post-hoc from a mip index.
 *
 * The previous implementation requested `blurRadius: 3` box-blurred mips and
 * then labelled level `i` with roughness `i / (levels - 1)`, so the reported
 * roughness had no relationship to the filter width actually applied.
 */
export function createExternalParityPmrem(
  source: Rgba8EnvironmentMapSource,
  options: {
    readonly levels?: number;
    readonly sampleCount?: number;
    readonly textureLabel?: string;
  } = {}
): ExternalParityPmrem {
  const sampleCount = options.sampleCount ?? 64;
  const mipLevels = generateSpecularPrefilterMipLevels(source, {
    levels: options.levels ?? 6,
    sampleCount
  });
  const levelRoughness = specularPrefilterLevelRoughness(mipLevels.length);
  const levels = mipLevels.map((level, index) => ({
    level: index,
    width: level.width,
    height: level.height,
    roughness: levelRoughness[index]!,
    byteLength: level.data.byteLength
  }));
  return {
    textureLabel: options.textureLabel ?? "external-parity-pmrem-specular",
    mipLevels,
    levels,
    diagnostics: {
      mipCount: mipLevels.length,
      maxRoughness: levels.at(-1)?.roughness ?? 0,
      totalByteLength: levels.reduce((sum, level) => sum + level.byteLength, 0),
      directionalReflectionReady: mipLevels.length >= 4 && mipLevels[0]!.width > mipLevels.at(-1)!.width,
      filterModel: "ggx-importance-sampled-equirect-prefilter",
      sampleCount
    }
  };
}
