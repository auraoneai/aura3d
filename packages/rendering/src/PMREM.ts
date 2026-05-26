import {
  generateSpecularPrefilterMipLevels,
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
  };
}

export function createExternalParityPmrem(
  source: Rgba8EnvironmentMapSource,
  options: { readonly levels?: number; readonly blurRadius?: number; readonly textureLabel?: string } = {}
): ExternalParityPmrem {
  const mipLevels = generateSpecularPrefilterMipLevels(source, {
    levels: options.levels ?? 6,
    blurRadius: options.blurRadius ?? 3
  });
  const levels = mipLevels.map((level, index) => ({
    level: index,
    width: level.width,
    height: level.height,
    roughness: Number((index / Math.max(1, mipLevels.length - 1)).toFixed(4)),
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
      directionalReflectionReady: mipLevels.length >= 4 && mipLevels[0]!.width > mipLevels.at(-1)!.width
    }
  };
}
